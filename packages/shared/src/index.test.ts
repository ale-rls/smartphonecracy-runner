import { describe, expect, it } from "vitest";
import { quadrantOf, quadrantOfField } from "./index.js";

describe("quadrantOf", () => {
  it("assigns the four open quadrants", () => {
    expect(quadrantOf(0.9, 0.1)).toBe("q1");
    expect(quadrantOf(0.1, 0.1)).toBe("q2");
    expect(quadrantOf(0.1, 0.9)).toBe("q3");
    expect(quadrantOf(0.9, 0.9)).toBe("q4");
  });

  it("follows the half-open boundary convention", () => {
    expect(quadrantOf(0.5, 0.1)).toBe("q1"); // x=0.5 -> right half
    expect(quadrantOf(0.1, 0.5)).toBe("q3"); // y=0.5 -> bottom half
    expect(quadrantOf(0.5, 0.5)).toBe("q4"); // exact center -> q4
  });
});

describe("quadrantOfField", () => {
  it("uses min/max for an x-axis two-quadrant field", () => {
    const field = {
      type: "two-quadrant" as const,
      axis: "x" as const,
      labels: { minLabel: "left", maxLabel: "right" },
    };
    expect(quadrantOfField(field, 0.499, 0.9)).toBe("min");
    expect(quadrantOfField(field, 0.5, 0.1)).toBe("max");
  });

  it("uses min/max for a y-axis two-quadrant field", () => {
    const field = {
      type: "two-quadrant" as const,
      axis: "y" as const,
      labels: { minLabel: "top", maxLabel: "bottom" },
    };
    expect(quadrantOfField(field, 0.9, 0.499)).toBe("min");
    expect(quadrantOfField(field, 0.1, 0.5)).toBe("max");
  });
});
