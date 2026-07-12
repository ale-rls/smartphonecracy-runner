import { describe, expect, it, vi } from "vitest";
import { parseRuntimeScenario } from "@smartphonecracy/studio-adapter";
import { Autosave, recoverDraft, type DraftDatabase } from "./drafts.js";
import { exportArtifacts, importBackup, importRuntime } from "./io.js";
import { autoLayout, type Draft } from "./model.js";
import scenario from "../../../content/scenarios/dev.json";
import manifest from "../../../content/media-manifest.json";
import e2eScenario from "../../../tests/e2e/fixtures/scenario.json";

class MemoryDb implements DraftDatabase {
  latest: Draft[] = [];
  history: Draft[] = [];
  async list() { return this.latest; }
  async revisions(id: string) { return this.history.filter((draft) => draft.id === id).sort((a, b) => b.updatedAt - a.updatedAt); }
  async put(draft: Draft) { this.latest = [structuredClone(draft)]; this.history.unshift(structuredClone(draft)); this.history = this.history.slice(0, 20); }
  async delete(id: string) { this.latest = this.latest.filter((draft) => draft.id !== id); this.history = this.history.filter((draft) => draft.id !== id); }
}

describe("Studio shell", () => {
  it("imports dev runtime, auto-layouts it, and exports normalized runtime without Studio fields", () => {
    const draft = importRuntime(scenario, manifest, "Dev");
    const artifacts = exportArtifacts(draft);
    expect(artifacts["scenario.json"]).toEqual(scenario);
    expect(artifacts["media-manifest.json"]).toEqual(manifest);
    expect(draft.document.nodes).toHaveLength(scenario.phases.length);
    expect(JSON.stringify(artifacts["scenario.json"])).not.toContain("viewport");
  });

  it.each([
    ["content dev", scenario],
    ["installation e2e", e2eScenario],
  ])("round-trips every checked-in scenario fixture: %s", (_name, fixture) => {
    expect(exportArtifacts(importRuntime(fixture, manifest))["scenario.json"]).toEqual(fixture);
  });

  it("round-trips a versioned Studio backup", () => {
    const draft = importRuntime(scenario, manifest);
    expect(importBackup({ format: "smartphonecracy-studio-backup", version: 1, draft })).toEqual(draft);
    expect(() => importBackup({ version: 99 })).toThrow("supported Studio backup");
  });

  it("debounces autosave and exposes saving/saved status", async () => {
    vi.useFakeTimers();
    const db = new MemoryDb();
    const draft = importRuntime(scenario, manifest);
    const statuses: string[] = [];
    new Autosave(db, 20).schedule(draft, (status) => statuses.push(status));
    expect(statuses).toEqual(["saving"]);
    await vi.advanceTimersByTimeAsync(20);
    expect(statuses).toEqual(["saving", "saved"]);
    expect(await db.list()).toHaveLength(1);
    vi.useRealTimers();
  });

  it("recovers the newest structurally good revision after a corrupt latest draft", async () => {
    const db = new MemoryDb();
    const project = parseRuntimeScenario(scenario, manifest);
    const id = crypto.randomUUID();
    const good: Draft = { id, name: "Good", updatedAt: 1, project, document: autoLayout(project, id) };
    db.latest = [{ ...good, updatedAt: 2, document: {} as Draft["document"] }];
    db.history = [good];
    expect((await recoverDraft(db, id))?.name).toBe("Good");
  });
});
