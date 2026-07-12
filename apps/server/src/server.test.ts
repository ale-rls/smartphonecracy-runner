import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ConfigError, buildServer, loadConfig, type ServerRuntime } from "./index.js";

const runtimes: ServerRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async ({ app }) => {
    if (app.server.listening) await app.close();
  }));
});

async function fixture(invalidScenario = false) {
  const root = await mkdtemp(join(tmpdir(), "smartphonecracy-server-"));
  const content = join(root, "content");
  const media = join(content, "media");
  await mkdir(media, { recursive: true });
  await writeFile(join(media, "intro.mp4"), "video");
  const scenario = {
    version: "test-1",
    entryPhaseId: "intro",
    cyclesAllowed: false,
    phases: [
      { kind: "idle", id: "idle" },
      { kind: "video", id: "intro", src: "intro.mp4", expectedDurationMs: 1000, next: invalidScenario ? "missing" : "idle" },
    ],
  };
  await writeFile(join(content, "scenario.json"), JSON.stringify(scenario));
  await writeFile(
    join(content, "media-manifest.json"),
    JSON.stringify({ files: [{ src: "intro.mp4", bytes: 5, hash: "test" }] }),
  );
  for (const role of ["display", "phone", "admin"]) {
    const dist = join(root, role, "dist");
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, "index.html"), `<h1>${role}</h1>`);
  }
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "3001",
    SCENARIO_PATH: "content/scenario.json",
    MEDIA_MANIFEST_PATH: "content/media-manifest.json",
    MEDIA_DIR: "content/media",
    DISPLAY_DIST_DIR: "display/dist",
    PHONE_DIST_DIR: "phone/dist",
    ADMIN_DIST_DIR: "admin/dist",
  }, root);
  return config;
}

describe("configuration", () => {
  it("resolves paths from the supplied root and rejects invalid values", async () => {
    const config = await fixture();
    expect(config.scenarioPath).toMatch(/content\/scenario\.json$/);
    expect(() => loadConfig({ PORT: "70000" })).toThrow(ConfigError);
    expect(() => loadConfig({ DATABASE_URL: "postgres://db" })).toThrow(/INSTALLATION_CLOSES_AT/);
    const persistent = loadConfig({
      DATABASE_URL: "postgres://db",
      INSTALLATION_CLOSES_AT: "2026-12-31T23:00:00+00:00",
    });
    expect(persistent.participantDataExpiresAt).toBe(Date.parse("2027-03-31T23:00:00Z"));
  });
});

describe("HTTP readiness and bundles", () => {
  it("reports health, readiness, sanitized status, and serves all client bundles", async () => {
    const runtime = await buildServer({ config: await fixture() });
    runtimes.push(runtime);
    expect((await runtime.app.inject({ url: "/healthz" })).statusCode).toBe(200);
    const ready = await runtime.app.inject({ url: "/readyz" });
    expect(ready.json()).toEqual({ ok: true, scenarioVersion: "test-1" });
    const status = (await runtime.app.inject({ url: "/api/status" })).json();
    expect(status).toMatchObject({ ready: true, scenarioVersion: "test-1" });
    expect(status).not.toHaveProperty("displayToken");
    for (const role of ["display", "phone", "admin"]) {
      const response = await runtime.app.inject({ url: `/${role}/` });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`<h1>${role}</h1>`);
      expect(response.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("exposes only the public video phase id-to-source map", async () => {
    const runtime = await buildServer({ config: await fixture() });
    runtimes.push(runtime);

    const response = await runtime.app.inject({ url: "/api/phases" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ intro: "intro.mp4" });
    expect(response.body).not.toContain("expectedDurationMs");
    expect(response.body).not.toContain("entryPhaseId");
    expect(response.body).not.toContain("idle");
  });

  it("serves the media manifest and immutable media without changing readiness", async () => {
    const runtime = await buildServer({ config: await fixture() });
    runtimes.push(runtime);

    const manifest = await runtime.app.inject({ url: "/media-manifest.json" });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers["content-type"]).toContain("application/json");
    expect(manifest.headers["cache-control"]).toBe("no-cache");
    expect(manifest.json()).toEqual({ files: [{ src: "intro.mp4", bytes: 5, hash: "test" }] });

    const media = await runtime.app.inject({ url: "/media/intro.mp4" });
    expect(media.statusCode).toBe(200);
    expect(media.body).toBe("video");
    expect(media.headers["content-type"]).toBe("video/mp4");
    expect(media.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    expect((await runtime.app.inject({ url: "/media/unknown.mp4" })).statusCode).toBe(404);
    expect((await runtime.app.inject({ url: "/media/%2e%2e/scenario.json" })).statusCode).toBe(404);
    expect((await runtime.app.inject({ url: "/readyz" })).json()).toEqual({
      ok: true,
      scenarioVersion: "test-1",
    });
  });

  it("stays live but fails readiness for an invalid scenario", async () => {
    const runtime = await buildServer({ config: await fixture(true) });
    runtimes.push(runtime);
    expect((await runtime.app.inject({ url: "/healthz" })).statusCode).toBe(200);
    const ready = await runtime.app.inject({ url: "/readyz" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json().errors[0]).toContain("unknown phase");
    const phases = await runtime.app.inject({ url: "/api/phases" });
    expect(phases.statusCode).toBe(503);
    expect(phases.json()).toEqual({ error: "scenario_unavailable" });
  });
});

describe("WebSocket lifecycle", () => {
  it("accepts /ws upgrades and closes clients during graceful shutdown", async () => {
    let connected = false;
    const runtime = await buildServer({
      config: await fixture(),
      onWebSocketConnection: () => { connected = true; },
    });
    runtimes.push(runtime);
    await runtime.app.listen({ host: "127.0.0.1", port: 0 });
    const address = runtime.app.server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");
    const client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });
    expect(connected).toBe(true);
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    await runtime.app.close();
    await closed;
    expect(runtime.webSockets.clients.size).toBe(0);
  });
});
