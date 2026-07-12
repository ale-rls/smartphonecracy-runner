import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
};

async function sendFile(
  reply: FastifyReply,
  filePath: string,
  cacheControl: string,
  notFoundError: string,
): Promise<void> {
  try {
    const bytes = await readFile(filePath);
    reply
      .header("cache-control", cacheControl)
      .type(contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream")
      .send(bytes);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") {
      await reply.code(404).send({ error: notFoundError });
      return;
    }
    throw error;
  }
}

async function sendBundleFile(
  reply: FastifyReply,
  root: string,
  requestedPath: string,
): Promise<void> {
  const relative = requestedPath === "" ? "index.html" : requestedPath;
  const rootPath = resolve(root);
  const filePath = resolve(rootPath, relative);
  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) {
    await reply.code(400).send({ error: "invalid_asset_path" });
    return;
  }

  await sendFile(
    reply,
    filePath,
    extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "asset_not_found",
  );
}

export function registerMediaRoutes(
  app: FastifyInstance,
  mediaManifestPath: string,
  mediaDir: string,
): void {
  app.get("/media-manifest.json", async (_request, reply) => {
    await sendFile(reply, resolve(mediaManifestPath), "no-cache", "media_manifest_not_found");
  });

  app.get<{ Params: { "*": string } }>("/media/*", async (request, reply) => {
    const rootPath = resolve(mediaDir);
    const filePath = resolve(rootPath, request.params["*"]);
    if (filePath === rootPath || !filePath.startsWith(`${rootPath}${sep}`)) {
      await reply.code(404).send({ error: "media_not_found" });
      return;
    }

    await sendFile(
      reply,
      filePath,
      "public, max-age=31536000, immutable",
      "media_not_found",
    );
  });
}

export function registerBundleRoutes(
  app: FastifyInstance,
  bundles: Record<"display" | "phone" | "admin", string>,
): void {
  app.get("/", async (_request, reply) => reply.redirect("/display/"));

  for (const role of ["display", "phone", "admin"] as const) {
    app.get(`/${role}`, async (_request, reply) => reply.redirect(`/${role}/`));
    app.get<{ Params: { "*": string } }>(`/${role}/*`, async (request, reply) => {
      await sendBundleFile(reply, bundles[role], request.params["*"]);
    });
  }
}
