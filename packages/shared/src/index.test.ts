import { describe, expect, it } from "vitest";
import { quadrantOf } from "./index.js";

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
