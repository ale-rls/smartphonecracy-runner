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
  ".webp": "image/webp",
};

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

  try {
    const bytes = await readFile(filePath);
    reply
      .header("cache-control", extname(filePath) === ".html" ? "no-cache" : "public, max-age=31536000, immutable")
      .type(contentTypes[extname(filePath)] ?? "application/octet-stream")
      .send(bytes);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") {
      await reply.code(404).send({ error: "asset_not_found" });
      return;
    }
    throw error;
  }
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
