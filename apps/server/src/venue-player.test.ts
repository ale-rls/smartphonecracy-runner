import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildVenuePlayer } from "./venue-player.js";

afterEach(() => vi.unstubAllGlobals());

describe("venue playback gateway", () => {
  it("serves an explicit local display build while keeping status on the live server", async () => {
    const dir = await mkdtemp(join(tmpdir(), "venue-display-"));
    await writeFile(join(dir, "index.html"), "local tracked QR display");
    await writeFile(join(dir, "app.js"), "local tracking code");
    const fetchLive = vi.fn(async (_url: URL) => new Response(JSON.stringify({ ready: true })));
    vi.stubGlobal("fetch", fetchLive);
    const player = await buildVenuePlayer({ serverUrl: "https://show.example", mediaDir: dir, displayDir: dir });
    try {
      const page = await player.inject({ url: "/display/?sound=1" });
      expect(page.body).toBe("local tracked QR display");
      expect(page.headers["cache-control"]).toBe("no-cache");
      expect((await player.inject({ url: "/display/app.js" })).body).toBe("local tracking code");
      expect((await player.inject({ url: "/display/missing.js" })).statusCode).toBe(404);
      expect(fetchLive).not.toHaveBeenCalled();
      expect((await player.inject({ url: "/api/status" })).json()).toEqual({ ready: true });
      expect(String(fetchLive.mock.calls[0]?.[0])).toBe("https://show.example/api/status");
    } finally {
      await player.close();
      await rm(dir, { recursive: true });
    }
  });

  it("uses the live display unless a local build is explicitly selected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("live display")));
    const player = await buildVenuePlayer({ serverUrl: "https://show.example", mediaDir: tmpdir() });
    try {
      expect((await player.inject({ url: "/display/" })).body).toBe("live display");
    } finally { await player.close(); }
  });

  it("verifies SSD hashes against the hosted manifest and rejects changed files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "venue-player-"));
    const file = join(dir, "film.mp4");
    await writeFile(file, "film");
    const manifest = { files: [{ src: "film.mp4", bytes: 4, hash: createHash("sha256").update("film").digest("hex") }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(manifest))));
    const player = await buildVenuePlayer({ serverUrl: "https://show.example", mediaDir: dir });
    try {
      const ready = await player.inject({ url: "/media-manifest.json" });
      expect(ready.statusCode).toBe(200);
      expect(ready.headers["x-media-delivery"]).toBe("local-stream");
      expect(ready.json()).toEqual(manifest);
      const range = await player.inject({ url: "/media/film.mp4", headers: { range: "bytes=1-2" } });
      expect(range.statusCode).toBe(206);
      expect(range.body).toBe("il");
      await writeFile(file, "oops");
      const changed = await player.inject({ url: "/media-manifest.json" });
      expect(changed.statusCode).toBe(503);
      expect(changed.json().error).toContain("does not match");
      expect((await player.inject({ url: "/api/admin/status" })).statusCode).toBe(404);
    } finally {
      await player.close();
      await rm(dir, { recursive: true });
    }
  });

  it("rejects manifest paths outside the SSD directory", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      files: [{ src: "../outside.mp4", bytes: 1, hash: "fake" }],
    }))));
    const player = await buildVenuePlayer({ serverUrl: "https://show.example", mediaDir: tmpdir() });
    try {
      expect((await player.inject({ url: "/media-manifest.json" })).statusCode).toBe(503);
    } finally { await player.close(); }
  });

  it.each(["http://show.example", "https://user:password@show.example", "https://show.example/path"])(
    "rejects unsafe or ambiguous coordinator origins: %s", async (serverUrl) => {
      await expect(buildVenuePlayer({ serverUrl, mediaDir: tmpdir() })).rejects.toThrow("HTTPS origin");
    },
  );
});
