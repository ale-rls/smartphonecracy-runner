import { compileStudioGraph, parseRuntimeScenario } from "@smartphonecracy/studio-adapter";
import { autoLayout, type Draft, type StudioBackup } from "./model.js";

export function importRuntime(scenario: unknown, manifest: unknown, name = "Imported show"): Draft {
  const project = parseRuntimeScenario(scenario, manifest);
  const id = crypto.randomUUID();
  return { id, name, updatedAt: Date.now(), project, document: autoLayout(project, id) };
}

export function importBackup(raw: unknown): Draft {
  const backup = raw as Partial<StudioBackup>;
  if (backup.format !== "smartphonecracy-studio-backup" || backup.version !== 1 || !backup.draft) {
    throw new Error("Not a supported Studio backup");
  }
  compileStudioGraph(backup.draft.project);
  return structuredClone(backup.draft);
}

export function exportArtifacts(draft: Draft) {
  const runtime = compileStudioGraph(draft.project);
  return {
    "scenario.json": runtime.scenario,
    "media-manifest.json": runtime.manifest,
    ".studio.json": draft.document,
  };
}

export function exportBackup(draft: Draft): StudioBackup {
  return { format: "smartphonecracy-studio-backup", version: 1, draft };
}
