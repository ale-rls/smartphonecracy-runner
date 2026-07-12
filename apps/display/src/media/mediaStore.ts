import type { MediaManifest } from "@smartphonecracy/scenario";

/**
 * Display media pipeline (plan §9):
 *  - boot-syncs the complete manifest into Cache Storage, keyed by
 *    content hash, verifying byte length and sha-256 of every download;
 *  - creates Blob URLs only for the active/next set and revokes them
 *    when they leave it (no <video> Range requests, no full-manifest
 *    Blob materialization);
 *  - stays out of "ready" and keeps retrying visibly when anything
 *    fails (the display must never report ready with missing media).
 *
 * All browser APIs are injectable so the logic is unit-testable.
 */

export type MediaSyncStatus =
  | { state: "idle" }
  | { state: "checking"; total: number }
  | { state: "downloading"; done: number; total: number; current: string }
  | { state: "retrying"; attempt: number; delayMs: number; lastError: string }
  | { state: "ready" }
  | { state: "failed"; lastError: string };

export type MediaStoreDeps = {
  cacheName?: string;
  caches?: CacheStorage;
  fetchFn?: typeof fetch;
  digest?: (data: ArrayBuffer) => Promise<string>;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  onStatus?: (status: MediaSyncStatus) => void;
  maxRetryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const cacheKeyFor = (hash: string) => `/media-cache/${hash}`;

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class MediaStore {
  private readonly cacheName: string;
  private readonly cachesObj: CacheStorage;
  private readonly fetchFn: typeof fetch;
  private readonly digest: (data: ArrayBuffer) => Promise<string>;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly onStatus: (status: MediaSyncStatus) => void;
  private readonly maxRetryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  private manifest: MediaManifest | null = null;
  private readonly blobUrls = new Map<string, string>(); // src -> object URL
  private stopped = false;

  constructor(deps: MediaStoreDeps = {}) {
    this.cacheName = deps.cacheName ?? "smartphonecracy-media-v1";
    this.cachesObj = deps.caches ?? caches;
    this.fetchFn = deps.fetchFn ?? fetch.bind(globalThis);
    this.digest = deps.digest ?? sha256Hex;
    this.createObjectUrl =
      deps.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl =
      deps.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
    this.onStatus = deps.onStatus ?? (() => {});
    this.maxRetryDelayMs = deps.maxRetryDelayMs ?? 30_000;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  stop(): void {
    this.stopped = true;
    this.retainOnly(new Set()); // revoke every live Blob URL on teardown
  }

  /**
   * Boot synchronization: retries forever with capped backoff until the
   * cache holds every manifest file (or stop() is called). Resolves true
   * once ready; false only when stopped.
   */
  async sync(manifest: MediaManifest): Promise<boolean> {
    this.manifest = manifest;
    for (let attempt = 0; !this.stopped; attempt += 1) {
      try {
        await this.syncOnce(manifest);
        this.onStatus({ state: "ready" });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const delayMs = Math.min(this.maxRetryDelayMs, 1000 * 2 ** attempt);
        this.onStatus({ state: "retrying", attempt: attempt + 1, delayMs, lastError: message });
        await this.sleep(delayMs);
      }
    }
    this.onStatus({ state: "failed", lastError: "stopped" });
    return false;
  }

  private async syncOnce(manifest: MediaManifest): Promise<void> {
    this.onStatus({ state: "checking", total: manifest.files.length });
    const cache = await this.cachesObj.open(this.cacheName);

    // Drop cache entries no longer referenced by the manifest.
    const wanted = new Set(manifest.files.map((f) => cacheKeyFor(f.hash)));
    for (const request of await cache.keys()) {
      const path = new URL(request.url, "http://local").pathname;
      if (path.startsWith("/media-cache/") && !wanted.has(path)) {
        await cache.delete(request);
      }
    }

    let done = 0;
    for (const file of manifest.files) {
      if (this.stopped) throw new Error("stopped");
      const key = cacheKeyFor(file.hash);
      const cached = await cache.match(key);
      if (cached) {
        // Full verification of cached entries too (plan §9: byte length
        // AND hash) — disk corruption on a year-long kiosk is a real
        // failure mode, and boot is the only cheap moment to catch it.
        const body = await cached.arrayBuffer();
        if (body.byteLength === file.bytes && (await this.digest(body)) === file.hash) {
          done += 1;
          continue;
        }
        await cache.delete(key); // truncated/corrupt entry — redownload
      }
      this.onStatus({
        state: "downloading",
        done,
        total: manifest.files.length,
        current: file.src,
      });
      // Bypass the browser HTTP cache: /media is served immutable
      // (STEP-029), so a corrupt response cached once would otherwise
      // poison every retry forever. Cache Storage is our only cache.
      const response = await this.fetchFn(`/media/${file.src}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`download failed for "${file.src}" (http ${response.status})`);
      }
      const body = await response.arrayBuffer();
      if (body.byteLength !== file.bytes) {
        throw new Error(
          `size mismatch for "${file.src}": expected ${file.bytes}, got ${body.byteLength}`,
        );
      }
      const hash = await this.digest(body);
      if (hash !== file.hash) {
        throw new Error(`hash mismatch for "${file.src}"`);
      }
      await cache.put(
        key,
        new Response(body, {
          headers: {
            "content-length": String(body.byteLength),
            "content-type": "video/mp4",
          },
        }),
      );
      done += 1;
    }
  }

  /**
   * Blob URL for a media src, creating it from the complete cached
   * response on first use (plan §9: Blob URLs only for active/next).
   */
  async getBlobUrl(src: string): Promise<string | null> {
    const existing = this.blobUrls.get(src);
    if (existing) return existing;
    const file = this.manifest?.files.find((f) => f.src === src);
    if (!file) return null;
    const cache = await this.cachesObj.open(this.cacheName);
    const cached = await cache.match(cacheKeyFor(file.hash));
    if (!cached) return null;
    const url = this.createObjectUrl(await cached.blob());
    this.blobUrls.set(src, url);
    return url;
  }

  /** Revoke every Blob URL not in the keep set (active + plausible next). */
  retainOnly(keepSrcs: ReadonlySet<string>): void {
    for (const [src, url] of this.blobUrls) {
      if (!keepSrcs.has(src)) {
        this.revokeObjectUrl(url);
        this.blobUrls.delete(src);
      }
    }
  }

  get activeBlobCount(): number {
    return this.blobUrls.size;
  }
}
