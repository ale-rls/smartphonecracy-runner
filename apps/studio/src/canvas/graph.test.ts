import { describe, expect, it } from "vitest";
import { parseRuntimeScenario } from "@smartphonecracy/studio-adapter";
import scenario from "../../../../content/scenarios/dev.json";
import manifest from "../../../../content/media-manifest.json";
import { acceptsInput, applyEdges, END_NODE_ID, ENTRY_NODE_ID, graphEdges, graphPhases, outputHandles, pruneEdges, validateConnection, withoutOutputEdge } from "./graph.js";

const project = () => parseRuntimeScenario(structuredClone(scenario), manifest);

describe("Studio canvas graph", () => {
  it("represents the runtime idle phase only through the editor End node", () => {
    const value = project();
    expect(value.scenario.phases.some((phase) => phase.kind === "idle")).toBe(true);
    expect(graphPhases(value).map((phase) => phase.id)).not.toContain("idle");
    expect(graphEdges(value).some((edge) => edge.target === END_NODE_ID)).toBe(true);
  });

  it("renders the typed runtime outputs and compiles editor markers away", () => {
    const value = project();
    const edges = graphEdges(value);
    expect(outputHandles(value, "question-quadrant")).toEqual(["q1", "q2", "q3", "q4", "tie", "empty"]);
    expect(acceptsInput(value, "question-quadrant")).toBe(true);
    expect(acceptsInput(value, END_NODE_ID)).toBe(true);
    expect(acceptsInput(value, ENTRY_NODE_ID)).toBe(false);
    expect(edges.find((edge) => edge.source === ENTRY_NODE_ID)).toBeTruthy();
    expect(edges.some((edge) => edge.target === END_NODE_ID)).toBe(true);
    expect(applyEdges(value, edges).scenario).toEqual(value.scenario);
  });

  it("enforces one edge per typed output while allowing shared targets", () => {
    const value = project();
    const edges = graphEdges(value).filter((edge) => edge.source !== "question-quadrant");
    expect(validateConnection(value, edges, { source: "question-quadrant", sourceHandle: "q1", target: END_NODE_ID, targetHandle: null })).toBeUndefined();
    const withQ1 = [...edges, { id: "q1", source: "question-quadrant", sourceHandle: "q1", target: END_NODE_ID }];
    expect(validateConnection(value, withQ1, { source: "question-quadrant", sourceHandle: "q2", target: END_NODE_ID, targetHandle: null })).toBeUndefined();
    expect(validateConnection(value, withQ1, { source: "question-quadrant", sourceHandle: "q1", target: "intro-video", targetHandle: null })).toMatch(/only one edge/);
    expect(validateConnection(value, edges, { source: ENTRY_NODE_ID, sourceHandle: "next", target: "intro-video", targetHandle: null })).toMatch(/exactly one entry/);
    expect(validateConnection(value, edges, { source: "question-quadrant", sourceHandle: "q1", target: "missing", targetHandle: null })).toMatch(/only has inputs/);
    const rewiringEntry = withoutOutputEdge(graphEdges(value), ENTRY_NODE_ID, "next");
    expect(validateConnection(value, rewiringEntry, { source: ENTRY_NODE_ID, sourceHandle: "next", target: "question-fixed", targetHandle: "input" })).toBeUndefined();
    expect(rewiringEntry.some((edge) => edge.source === ENTRY_NODE_ID)).toBe(false);
  });

  it("cleans every attached edge when a node is deleted and rejects dangling compile", () => {
    const value = project();
    const edges = graphEdges(value);
    const remaining = new Set([ENTRY_NODE_ID, END_NODE_ID, "idle", "intro-video", "question-quadrant"]);
    const pruned = pruneEdges(edges, remaining);
    expect(pruned.some((edge) => edge.source === "question-fixed" || edge.target === "question-fixed")).toBe(false);
    expect(() => applyEdges(value, pruned)).toThrow(/dangling/);
  });
});
