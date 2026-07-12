import { describe, expect, it, vi } from "vitest";
import type { MediaManifest } from "@smartphonecracy/scenario";
import { MediaStore, type MediaSyncStatus } from "./mediaStore.js";

/** Minimal in-memory CacheStorage double. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (key: string | Request) => {
        const k = typeof key === "string" ? key : new URL(key.url).pathname;
        const hit = store.get(k);
        return hit ? hit.clone() : undefined;
      },
      put: async (key: string | Request, response: Response) => {
        const k = typeof key === "string" ? key : new URL(key.url).pathname;
        store.set(k, response);
      },
      delete: async (key: string | Request) => {
        const k = typeof key === "string" ? key : new URL(key.url).pathname;
        return store.delete(k);
      },
      keys: async () =>
        [...store.keys()].map((k) => new Request(`http://local${k}`)),
    };
  };
  return { caches: { open } as unknown as CacheStorage, stores };
}

const manifest: MediaManifest = {
  files: [
    { src: "a.mp4", bytes: 3, hash: "hash-a" },
    { src: "b.mp4", bytes: 5, hash: "hash-b" },
  ],
};

const bodies: Record<string, string> = { "a.mp4": "AAA", "b.mp4": "BBBBB" };

const fakeFetch = (overrides: Partial<Record<string, () => Response>> = {}) =>
  (async (input: RequestInfo | URL) => {
    const src = String(input).replace("/media/", "");
    const override = overrides[src];
    if (override) return override();
    const body = bodies[src];
    if (body === undefined) return new Response(null, { status: 404 });
    return new Response(new TextEncoder().encode(body));
  }) as typeof fetch;

const fakeDigest = async (data: ArrayBuffer) =>
  `hash-${new TextDecoder().decode(data)[0]!.toLowerCase()}`;

const makeStore = (opts: {
  caches: CacheStorage;
  fetchFn?: typeof fetch;
  statuses?: MediaSyncStatus[];
}) =>
  new MediaStore({
    caches: opts.caches,
    fetchFn: opts.fetchFn ?? fakeFetch(),
    digest: fakeDigest,
    createObjectUrl: (blob) => `blob:${blob.size}`,
    revokeObjectUrl: vi.fn(),
    onStatus: (s) => opts.statuses?.push(s),
    sleep: async () => {},
  });

describe("MediaStore.sync", () => {
  it("downloads missing files, verifies them, and reaches ready", async () => {
    const { caches, stores } = fakeCaches();
    const statuses: MediaSyncStatus[] = [];
    const store = makeStore({ caches, statuses });
    await expect(store.sync(manifest)).resolves.toBe(true);
    expect(statuses.at(-1)).toEqual({ state: "ready" });
    const cached = stores.get("smartphonecracy-media-v1")!;
    expect(cached.has("/media-cache/hash-a")).toBe(true);
    expect(cached.has("/media-cache/hash-b")).toBe(true);
  });

  it("skips files already cached with the right size", async () => {
    const { caches } = fakeCaches();
    const store = makeStore({ caches });
    await store.sync(manifest);
    const fetchSpy = vi.fn(fakeFetch());
    const second = new MediaStore({
      caches,
      fetchFn: fetchSpy as typeof fetch,
      digest: fakeDigest,
      sleep: async () => {},
    });
    await second.sync(manifest);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries on size mismatch and stays out of ready", async () => {
    const { caches } = fakeCaches();
    const statuses: MediaSyncStatus[] = [];
    let calls = 0;
    const flaky = (async (input: RequestInfo | URL) => {
      const src = String(input).replace("/media/", "");
      if (src === "a.mp4" && calls++ === 0) {
        return new Response(new TextEncoder().encode("AA")); // truncated
      }
      return fakeFetch()(input);
    }) as typeof fetch;
    const store = makeStore({ caches, fetchFn: flaky, statuses });
    await expect(store.sync(manifest)).resolves.toBe(true);
    expect(statuses.some((s) => s.state === "retrying")).toBe(true);
    expect(statuses.at(-1)).toEqual({ state: "ready" });
  });

  it("retries on hash mismatch", async () => {
    const { caches } = fakeCaches();
    const statuses: MediaSyncStatus[] = [];
    let calls = 0;
    const corrupted = (async (input: RequestInfo | URL) => {
      const src = String(input).replace("/media/", "");
      if (src === "a.mp4" && calls++ === 0) {
        return new Response(new TextEncoder().encode("XAA")); // wrong content, right size
      }
      return fakeFetch()(input);
    }) as typeof fetch;
    const store = makeStore({ caches, fetchFn: corrupted, statuses });
    await expect(store.sync(manifest)).resolves.toBe(true);
    const retry = statuses.find((s) => s.state === "retrying");
    expect(retry && "lastError" in retry && retry.lastError).toContain("hash mismatch");
  });

  it("re-hashes cached entries and redownloads corrupted ones", async () => {
    const { caches, stores } = fakeCaches();
    await makeStore({ caches }).sync(manifest);
    // Corrupt the cached copy of a.mp4: right length, wrong content.
    stores
      .get("smartphonecracy-media-v1")!
      .set(
        "/media-cache/hash-a",
        new Response(new TextEncoder().encode("XXX"), {
          headers: { "content-length": "3" },
        }),
      );
    const fetchSpy = vi.fn(fakeFetch());
    const second = new MediaStore({
      caches,
      fetchFn: fetchSpy as typeof fetch,
      digest: fakeDigest,
      sleep: async () => {},
    });
    await expect(second.sync(manifest)).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // only the corrupted file
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("a.mp4");
  });

  it("removes cache entries dropped from the manifest", async () => {
    const { caches, stores } = fakeCaches();
    const store = makeStore({ caches });
    await store.sync(manifest);
    const shrunk: MediaManifest = { files: [manifest.files[0]!] };
    await makeStore({ caches }).sync(shrunk);
    const cached = stores.get("smartphonecracy-media-v1")!;
    expect(cached.has("/media-cache/hash-a")).toBe(true);
    expect(cached.has("/media-cache/hash-b")).toBe(false);
  });
});

describe("Blob URL lifecycle", () => {
  it("creates URLs from cache and revokes outside the keep set", async () => {
    const { caches } = fakeCaches();
    const revoke = vi.fn();
    const store = new MediaStore({
      caches,
      fetchFn: fakeFetch(),
      digest: fakeDigest,
      createObjectUrl: (blob) => `blob:${blob.size}`,
      revokeObjectUrl: revoke,
      sleep: async () => {},
    });
    await store.sync(manifest);
    const a = await store.getBlobUrl("a.mp4");
    const b = await store.getBlobUrl("b.mp4");
    expect(a).toBe("blob:3");
    expect(b).toBe("blob:5");
    expect(await store.getBlobUrl("a.mp4")).toBe(a); // memoized
    store.retainOnly(new Set(["b.mp4"]));
    expect(revoke).toHaveBeenCalledWith("blob:3");
    expect(store.activeBlobCount).toBe(1);
  });

  it("revokes all Blob URLs on stop()", async () => {
    const { caches } = fakeCaches();
    const revoke = vi.fn();
    const store = new MediaStore({
      caches,
      fetchFn: fakeFetch(),
      digest: fakeDigest,
      createObjectUrl: (blob) => `blob:${blob.size}`,
      revokeObjectUrl: revoke,
      sleep: async () => {},
    });
    await store.sync(manifest);
    await store.getBlobUrl("a.mp4");
    await store.getBlobUrl("b.mp4");
    store.stop();
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(store.activeBlobCount).toBe(0);
  });

  it("returns null for unknown or uncached media", async () => {
    const { caches } = fakeCaches();
    const store = makeStore({ caches });
    await store.sync(manifest);
    expect(await store.getBlobUrl("ghost.mp4")).toBeNull();
  });
});
