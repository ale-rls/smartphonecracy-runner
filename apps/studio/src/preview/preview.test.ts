import { describe, expect, it } from "vitest";
import scenario from "../../../../content/scenarios/dev.json";
import manifest from "../../../../content/media-manifest.json";
import { importRuntime } from "../io.js";
import { advancePreview, continueAfterResolution, resolvePreview, startPreview } from "./preview.js";
const project = importRuntime(scenario, manifest).project;
describe("outcome preview", () => {
  it("walks video and fixed phases manually", () => {
    let preview = advancePreview(startPreview(project));
    expect(preview.phaseId).toBe("question-fixed");
    preview = resolvePreview(preview, "q4");
    expect(preview.resolution).toMatchObject({ winner: "fixed", resolvedTarget: "question-quadrant", freezeMs: 3000 });
    expect(continueAfterResolution(preview).phaseId).toBe("question-quadrant");
  });
  it("uses shared resolution parity for filtering, tie and empty", () => {
    let preview = startPreview({ ...project, scenario: { ...project.scenario, entryPhaseId: "question-quadrant" } });
    preview = resolvePreview(preview, "tie", false, false);
    expect(preview.resolution).toMatchObject({ winner: "tie", quadrantCounts: { q1: 1, q2: 1, q3: 0, q4: 0 }, includedTotal: 2, excludedTotal: 0 });
    preview = resolvePreview(preview, "empty");
    expect(preview.resolution).toMatchObject({ winner: "empty", resolvedTarget: "idle", includedTotal: 0, excludedTotal: 1 });
    preview = resolvePreview(preview, "q1", true, true);
    expect(preview.resolution).toMatchObject({ winner: "q1", quadrantCounts: { q1: 3, q2: 0, q3: 0, q4: 0 }, includedByStatus: { valid: 1, stale: 1, disconnected: 1 } });
  });
  it("models abandoned solo as disconnected", () => {
    const preview = resolvePreview(startPreview({ ...project, scenario: { ...project.scenario, entryPhaseId: "question-quadrant" } }), "abandoned-solo", true, false);
    expect(preview.resolution?.votes[0]).toMatchObject({ participantId: "solo", status: "disconnected" });
    expect(preview.resolution).toMatchObject({ winner: "q4", includedTotal: 1 });
  });
});
