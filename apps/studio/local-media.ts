import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

export const LOCAL_MEDIA_MANIFEST_ENDPOINT = "/__studio/local-media-manifest";

export type LocalMediaManifest = {
  files: Array<{ src: string; bytes: number; hash: string }>;
};

type HashCache = Map<string, { bytes: number; modifiedAt: number; hash: string }>;

const hashFile = (path: string) => new Promise<string>((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

async function regularFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith("."))
    .map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return regularFiles(path);
      return entry.isFile() ? [path] : [];
    }));
  return files.flat();
}

/** Build the canonical runtime manifest directly from the local media directory. */
export async function scanLocalMedia(mediaDirectory: string, cache: HashCache = new Map()): Promise<LocalMediaManifest> {
  const paths = await regularFiles(mediaDirectory);
  const files = await Promise.all(paths.map(async (path) => {
    const metadata = await stat(path);
    const cached = cache.get(path);
    const hash = cached?.bytes === metadata.size && cached.modifiedAt === metadata.mtimeMs
      ? cached.hash
      : await hashFile(path);
    cache.set(path, { bytes: metadata.size, modifiedAt: metadata.mtimeMs, hash });
    return {
      src: relative(mediaDirectory, path).split(sep).join("/"),
      bytes: metadata.size,
      hash,
    };
  }));
  files.sort((left, right) => left.src.localeCompare(right.src));
  return { files };
}

/** Expose a fresh manifest to the browser on every Studio page load. */
export function localMediaManifestPlugin(mediaDirectory: string): Plugin {
  const cache: HashCache = new Map();
  return {
    name: "smartphonecracy-local-media-manifest",
    configureServer(server) {
      server.middlewares.use(LOCAL_MEDIA_MANIFEST_ENDPOINT, async (request, response, next) => {
        if (request.method !== "GET") return next();
        try {
          const manifest = await scanLocalMedia(mediaDirectory, cache);
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(manifest));
        } catch (error) {
          server.config.logger.error(`Could not scan local Studio media: ${error instanceof Error ? error.message : String(error)}`);
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "Could not scan content/media" }));
        }
      });
    },
  };
}
