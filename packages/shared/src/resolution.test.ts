import { describe, expect, it } from "vitest";
import { classifyPositionVotes, countQuadrants, materializePositionStatus, resolveFixedTransition, resolveQuadrantPlurality } from "./resolution.js";

describe("resolution math", () => {
  const votes = [
    { x: 0.5, y: 0.25, status: "valid" },
    { x: 0.25, y: 0.5, status: "stale" },
    { x: 0.5, y: 0.5, status: "excluded" },
    { x: null, y: null, status: "valid" },
  ] as const;

  it("counts positioned votes with the shared boundary convention", () => {
    expect(countQuadrants(votes)).toEqual({ q1: 1, q2: 0, q3: 1, q4: 1 });
    expect(resolveFixedTransition(votes, "next")).toEqual({
      winner: "fixed", resolvedTarget: "next", quadrantCounts: { q1: 1, q2: 0, q3: 1, q4: 1 },
    });
  });

  it("filters statuses and distinguishes unique, tie, and empty outcomes", () => {
    expect(resolveQuadrantPlurality(votes, new Set(["valid"]))).toEqual({
      winner: "q1",
      quadrantCounts: { q1: 1, q2: 0, q3: 0, q4: 0 },
    });
    expect(resolveQuadrantPlurality(votes, new Set(["valid", "stale"]))).toEqual({
      winner: "tie",
      quadrantCounts: { q1: 1, q2: 0, q3: 1, q4: 0 },
    });
    expect(resolveQuadrantPlurality(votes, new Set(["missing"]))).toEqual({
      winner: "empty",
      quadrantCounts: { q1: 0, q2: 0, q3: 0, q4: 0 },
    });
  });

  it("materializes every status with disconnected precedence and classifies totals", () => {
    expect(materializePositionStatus({ connected: false, x: null, y: null, lastHeartbeatAt: null }, 100, 10)).toBe("disconnected");
    expect(materializePositionStatus({ connected: true, x: null, y: null, lastHeartbeatAt: 100 }, 100, 10)).toBe("never-moved");
    expect(materializePositionStatus({ connected: true, x: 0, y: 0, lastHeartbeatAt: 90 }, 100, 10)).toBe("stale");
    expect(materializePositionStatus({ connected: true, x: 0, y: 0, lastHeartbeatAt: 91 }, 100, 10)).toBe("valid");
    expect(classifyPositionVotes(votes, new Set(["valid", "stale"]))).toMatchObject({
      includedTotal: 2,
      excludedTotal: 2,
      includedByStatus: { valid: 1, stale: 1 },
      excludedByStatus: { excluded: 1, valid: 1 },
    });
  });

  it.each([
    [0.75, 0.25, "q1"], [0.25, 0.25, "q2"], [0.25, 0.75, "q3"], [0.75, 0.75, "q4"],
  ] as const)("resolves a unique %s/%s winner", (x, y, winner) => {
    expect(resolveQuadrantPlurality([{ x, y, status: "valid" }], new Set(["valid"])).winner).toBe(winner);
  });
});
