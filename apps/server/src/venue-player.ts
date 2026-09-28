import Fastify from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { mediaManifestSchema, validateMediaManifest } from "@smartphonecracy/scenario";
import { registerMediaRoutes, sendBundleFile } from "./static.js";

/** Local playback only: the public server remains the sole show authority. */
export async function buildVenuePlayer(options: { serverUrl: string; mediaDir: string; displayDir?: string }) {
  const upstream = new URL(options.serverUrl);
  if (upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash
    || (upstream.protocol !== "https:" && !(upstream.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(upstream.hostname)))) {
    throw new Error("VENUE_SERVER_URL must be an HTTPS origin (HTTP localhost is allowed for testing)");
  }
  const app = Fastify({ logger: false });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const upstreamSockets = new Set<WebSocket>();
  const verified = new Map<string, string>();
  const mediaRoot = resolve(options.mediaDir);
  const displayRoot = options.displayDir === undefined ? undefined : resolve(options.displayDir);
  if (displayRoot !== undefined && !(await stat(resolve(displayRoot, "index.html"))).isFile()) {
    throw new Error("Local display build is missing index.html; build the display first");
  }

  const mediaPath = (src: string) => {
    const path = resolve(mediaRoot, src);
    if (!path.startsWith(`${mediaRoot}${sep}`)) throw new Error("Invalid venue media path");
    return path;
  };
  app.get("/", async (_request, reply) => reply.redirect("/display/"));
  app.get("/healthz", async () => ({ ok: true, role: "venue-player" }));
  registerMediaRoutes(app, mediaRoot);

  app.get("/media-manifest.json", async (_request, reply) => {
    try {
      const response = await fetch(new URL("/media-manifest.json", upstream), {
        signal: AbortSignal.timeout(15_000), headers: { "cache-control": "no-cache" },
      });
      if (!response.ok) return reply.code(503).send({ error: "Live show media manifest unavailable" });
      const manifest = mediaManifestSchema.parse(await response.json());
      const checked = await validateMediaManifest(manifest, async (src) => (await stat(mediaPath(src))).size);
      if (!checked.ok) return reply.code(503).send({ error: checked.errors.map((issue) => issue.message).join("; ") });
      for (const file of manifest.files) {
        const path = mediaPath(file.src);
        const info = await stat(path);
        const identity = `${file.hash}:${info.size}:${info.mtimeMs}`;
        if (verified.get(path) === identity) continue;
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(path)) hash.update(chunk);
        if (hash.digest("hex") !== file.hash) {
          return reply.code(503).send({ error: `SSD file does not match the live show: ${file.src}` });
        }
        verified.set(path, identity);
      }
      return reply.header("cache-control", "no-store").header("x-media-delivery", "local-stream").send(manifest);
    } catch (error) {
      return reply.code(503).send({ error: error instanceof Error ? error.message : "Venue media unavailable" });
    }
  });

  // Load the display shell from the live deployment so its build version and
  // protocol always match the phones and coordinator. An explicit local build
  // override lets venue fixes be tested before the live deployment is updated.
  for (const path of ["/display", "/display/*", "/api/status", "/api/phases"] as const) {
    app.get(path, async (request, reply) => {
      if (request.url === "/display") return reply.redirect("/display/");
      if (displayRoot !== undefined && request.url.startsWith("/display/")) {
        return sendBundleFile(reply, displayRoot, (request.params as { "*": string })["*"], request.headers.range);
      }
      try {
        const response = await fetch(new URL(request.url, upstream), { signal: AbortSignal.timeout(15_000), redirect: "error" });
        for (const header of ["content-type", "cache-control", "etag", "last-modified"]) {
          const value = response.headers.get(header);
          if (value !== null) reply.header(header, value);
        }
        reply.code(response.status);
        return response.body === null ? reply.send() : reply.send(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream));
      } catch {
        return reply.code(502).send({ error: "Live show server unavailable" });
      }
    });
  }

  app.server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") { socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, (client) => {
      const url = new URL("/ws", upstream);
      url.protocol = upstream.protocol === "https:" ? "wss:" : "ws:";
      const remote = new WebSocket(url, { handshakeTimeout: 10_000 });
      upstreamSockets.add(remote);
      const pending: { data: Buffer; binary: boolean }[] = [];
      let pendingBytes = 0;
      const stop = () => { client.close(1011, "Live server connection lost"); remote.terminate(); };
      remote.on("open", () => {
        for (const message of pending) remote.send(message.data, { binary: message.binary });
        pending.length = 0;
        pendingBytes = 0;
      });
      client.on("message", (data, binary) => {
        const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
        if (remote.readyState === WebSocket.OPEN) remote.send(buffer, { binary });
        else if (remote.readyState === WebSocket.CONNECTING && pendingBytes + buffer.length <= 64 * 1024) {
          pending.push({ data: buffer, binary });
          pendingBytes += buffer.length;
        } else stop();
      });
      remote.on("message", (data, binary) => {
        if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 1024 * 1024) client.send(data, { binary });
        else stop();
      });
      remote.on("close", (code, reason) => {
        upstreamSockets.delete(remote);
        client.close(code === 1005 || code === 1006 ? 1011 : code, reason);
      });
      remote.on("error", stop);
      client.on("error", () => remote.terminate());
      client.on("close", () => remote.terminate());
    });
  });
  app.addHook("onClose", async () => {
    for (const socket of sockets.clients) socket.terminate();
    for (const socket of upstreamSockets) socket.terminate();
    await new Promise<void>((resolveClose) => sockets.close(() => resolveClose()));
  });
  return app;
}
