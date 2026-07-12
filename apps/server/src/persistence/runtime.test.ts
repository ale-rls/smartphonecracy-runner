import { describe, expect, it, vi } from "vitest";
import { scenarioSchema } from "@smartphonecracy/scenario";
import { loadConfig } from "../config.js";
import { createPersistenceRuntime } from "./runtime.js";

const scenario = scenarioSchema.parse({
  version: "runtime-test",
  entryPhaseId: "intro",
  cyclesAllowed: false,
  phases: [
    { kind: "idle", id: "idle" },
    { kind: "video", id: "intro", src: "intro.mp4", expectedDurationMs: 1_000, next: "idle" },
  ],
});

describe("production persistence runtime", () => {
  it("stays disabled when DATABASE_URL is absent", async () => {
    const createPool = vi.fn();
    expect(await createPersistenceRuntime(loadConfig({ NODE_ENV: "test" }), scenario, { createPool })).toBeNull();
    expect(createPool).not.toHaveBeenCalled();
  });

  it("migrates, records crash recovery, and closes its held database client", async () => {
    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    let released = false;
    let ended = false;
    const client = {
      async query(text: string, values?: readonly unknown[]) {
        queries.push({ text, ...(values === undefined ? {} : { values }) });
        if (text.startsWith("select id from sessions")) return { rows: [{ id: "active-session" }] };
        return { rows: [] };
      },
      release() { released = true; },
    };
    const runtime = await createPersistenceRuntime(loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://example.invalid/db",
      INSTALLATION_CLOSES_AT: "2026-12-31T23:00:00+00:00",
    }), scenario, {
      createPool: () => ({ connect: async () => client, end: async () => { ended = true; } }),
      readMigration: async () => "-- migration marker",
      now: () => Date.parse("2026-07-12T15:00:00Z"),
    });

    expect(runtime).not.toBeNull();
    expect(queries[0]?.text).toBe("-- migration marker");
    expect(queries.some(({ text }) => text.includes("insert into scenarios"))).toBe(true);
    expect(queries.some(({ text }) => text.startsWith("update sessions set status='ended'"))).toBe(true);
    expect(queries.some(({ text }) => text.includes("'recovery'"))).toBe(true);
    await runtime?.close();
    expect(released).toBe(true);
    expect(ended).toBe(true);
  });
});
