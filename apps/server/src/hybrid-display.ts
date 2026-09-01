import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { pathToFileURL, fileURLToPath } from "node:url";
import Fastify from "fastify";
import PocketBase, { type RecordModel } from "pocketbase";
import { mediaManifestSchema, type MediaManifest } from "@smartphonecracy/scenario";
import { z } from "zod";
import { registerBundleRoute, registerMediaRoutes } from "./static.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const envSchema = z.object({
  HYBRID_DISPLAY_HOST: z.string().min(1).default("127.0.0.1"),
  HYBRID_DISPLAY_PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  PUBLIC_SERVER_URL: z.string().url().default("https://smartphonocracy-server.enabler.space"),
  POCKETBASE_URL: z.string().url().default("https://smartphonocracy.enabler.space"),
  REALTIME_WS_URL: z.string().url().default("wss://smartphonocracy-websockets.enabler.space"),
  DISPLAY_TOKEN: z.string().min(1),
  MEDIA_DIR: z.string().min(1).optional(),
  DISPLAY_DIST_DIR: z.string().min(1).optional(),
  HYBRID_ALLOW_VERSION_MISMATCH: z.enum(["true", "false"]).default("false"),
});

type PublicStatus = {
  ready: boolean;
  buildVersion: string;
  installationId: string;
  roomId: string;
  scenarioVersion: string | null;
  startedAt: number;
};

type MediaRecord = RecordModel & {
  src: string;
  bytes: number;
  hash: string;
  file: string;
};

export type HybridDisplayConfig = z.infer<typeof envSchema> & {
  mediaDir: string;
  displayDistDir: string;
  statusUrl: string;
  manifestUrl: string;
  controlWsUrl: string;
};

export function controlWebSocketUrl(publicServerUrl: string): string {
  const url = new URL(publicServerUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else throw new Error("PUBLIC_SERVER_URL must use HTTP or HTTPS");
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function loadHybridDisplayConfig(env: NodeJS.ProcessEnv = process.env): HybridDisplayConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`invalid hybrid display configuration: ${detail}`);
  }
  const value = parsed.data;
  const publicServerUrl = new URL(value.PUBLIC_SERVER_URL);
  if (publicServerUrl.protocol !== "https:") {
    throw new Error("PUBLIC_SERVER_URL must use HTTPS");
  }
  const realtimeUrl = new URL(value.REALTIME_WS_URL);
  if (realtimeUrl.protocol !== "wss:") {
    throw new Error("REALTIME_WS_URL must use WSS");
  }
  return {
    ...value,
    mediaDir: resolve(repoRoot, value.MEDIA_DIR ?? "content/media"),
    displayDistDir: resolve(repoRoot, value.DISPLAY_DIST_DIR ?? "apps/display/dist"),
    statusUrl: new URL("/api/status", publicServerUrl).toString(),
    manifestUrl: new URL("/media-manifest.json", publicServerUrl).toString(),
    controlWsUrl: controlWebSocketUrl(publicServerUrl.toString()),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

const statusSchema = z.object({
  ready: z.boolean(),
  buildVersion: z.string().min(1),
  installationId: z.string().min(1),
  roomId: z.string().min(1),
  scenarioVersion: z.string().nullable(),
  startedAt: z.number(),
});

async function readPublicState(config: HybridDisplayConfig): Promise<{
  status: PublicStatus;
  manifest: MediaManifest;
}> {
  const [statusRaw, manifestRaw] = await Promise.all([
    fetchJson(config.statusUrl),
    fetchJson(config.manifestUrl),
  ]);
  const status = statusSchema.parse(statusRaw);
  if (!status.ready) throw new Error("The public show server is not ready");
  return { status, manifest: mediaManifestSchema.parse(manifestRaw) };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function localFileMatches(path: string, bytes: number, hash: string): Promise<boolean> {
  const fileStat = await stat(path).catch(() => null);
  return fileStat?.isFile() === true
    && fileStat.size === bytes
    && await sha256File(path) === hash;
}

/** Download exactly the active online show's media working set onto local disk. */
export async function syncActiveMedia(
  config: Pick<HybridDisplayConfig, "POCKETBASE_URL" | "mediaDir">,
  manifest: MediaManifest,
): Promise<void> {
  const pocketbase = new PocketBase(config.POCKETBASE_URL);
  const records = await pocketbase.collection<MediaRecord>("media").getFullList();
  const bySource = new Map(records.map((record) => [record.src, record]));
  await mkdir(config.mediaDir, { recursive: true });

  for (const file of manifest.files) {
    if (file.src !== basename(file.src)) throw new Error(`invalid media filename in manifest: ${file.src}`);
    const target = join(config.mediaDir, file.src);
    if (await localFileMatches(target, file.bytes, file.hash)) continue;

    const record = bySource.get(file.src);
    if (!record) throw new Error(`PocketBase has no media record for active file "${file.src}"`);
    if (record.bytes !== file.bytes || record.hash !== file.hash) {
      throw new Error(`PocketBase media "${file.src}" does not match the active published manifest`);
    }

    const response = await fetch(pocketbase.files.getURL(record, record.file), {
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`failed to download "${file.src}" from PocketBase (HTTP ${response.status})`);
    }
    const temporary = `${target}.hybrid-download-${process.pid}`;
    try {
      await pipeline(
        Readable.fromWeb(response.body as WebReadableStream),
        createWriteStream(temporary),
      );
      if (!await localFileMatches(temporary, file.bytes, file.hash)) {
        throw new Error(`downloaded media "${file.src}" failed size/hash verification`);
      }
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

function runBuild(env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@smartphonecracy/display", "build"],
      { cwd: repoRoot, env, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`display build failed (${signal ?? `exit ${code ?? "unknown"}`})`));
    });
  });
}

function localRevision(): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

export async function startHybridDisplay(): Promise<void> {
  const config = loadHybridDisplayConfig();
  const checkOnly = process.argv.includes("--check");
  const skipBuild = process.argv.includes("--skip-build");
  const { status, manifest } = await readPublicState(config);
  const revision = localRevision();
  if (
    config.HYBRID_ALLOW_VERSION_MISMATCH !== "true"
    && revision !== null
    && status.buildVersion !== revision
  ) {
    throw new Error(
      `Local checkout ${revision} does not match online build ${status.buildVersion}. `
      + "Use the same revision as the hosted core, or explicitly set HYBRID_ALLOW_VERSION_MISMATCH=true for diagnostics.",
    );
  }

  console.log("Hybrid display configuration");
  console.log(`  phone app + authoritative show: ${config.PUBLIC_SERVER_URL}`);
  console.log(`  show WebSocket: ${config.controlWsUrl}`);
  console.log(`  cursor relay: ${config.REALTIME_WS_URL}`);
  console.log(`  installation/room: ${status.installationId}/${status.roomId}`);
  console.log(`  online build/scenario: ${status.buildVersion}/${status.scenarioVersion ?? "unknown"}`);
  console.log(`  local display: http://127.0.0.1:${config.HYBRID_DISPLAY_PORT}/display/`);
  console.log(`  active local media files: ${manifest.files.length}`);

  if (checkOnly) {
    console.log("Online control plane and hybrid configuration are valid. Nothing was changed or started.");
    return;
  }

  const buildEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BUILD_VERSION: status.buildVersion,
    CONTROL_WS_URL: config.controlWsUrl,
    DISPLAY_TOKEN: config.DISPLAY_TOKEN,
    REALTIME_WS_URL: config.REALTIME_WS_URL,
  };
  if (!skipBuild) await runBuild(buildEnv);

  console.log("Synchronizing the active show's media to local disk...");
  await syncActiveMedia(config, manifest);

  const app = Fastify({ logger: true });
  app.get("/", async (_request, reply) => reply.redirect("/display/"));
  app.get("/healthz", async () => ({ ok: true }));
  app.get("/readyz", async () => ({
    ok: true,
    publicServerUrl: config.PUBLIC_SERVER_URL,
    scenarioVersion: status.scenarioVersion,
    mediaFiles: manifest.files.length,
  }));
  app.get("/api/status", async (_request, reply) => {
    try {
      return await fetchJson(config.statusUrl);
    } catch (error) {
      return reply.code(502).send({
        error: "public_show_unavailable",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });
  app.get("/media-manifest.json", async (_request, reply) => {
    reply.header("cache-control", "no-cache");
    return manifest;
  });
  registerMediaRoutes(app, config.mediaDir);
  registerBundleRoute(app, "display", config.displayDistDir);

  await app.listen({ host: config.HYBRID_DISPLAY_HOST, port: config.HYBRID_DISPLAY_PORT });
  console.log("Hybrid display is ready. Phones remain on the public web; only display assets and media are local.");

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void app.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  startHybridDisplay().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
