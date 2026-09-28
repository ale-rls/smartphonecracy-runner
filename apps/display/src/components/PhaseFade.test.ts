import { describe, expect, it } from "vitest";
import { fadeProgress } from "./PhaseFade.js";
describe("credits fade", () => {
  it("holds picture and audio until 60 seconds and reaches black at 63, including late reconnects", () => {
    expect(fadeProgress(59000, 1000, 63000, 3000)).toBe(0);
    expect(fadeProgress(61000, 1000, 63000, 3000)).toBe(0);
    expect(fadeProgress(62500, 1000, 63000, 3000)).toBe(0.5);
    expect(fadeProgress(64000, 1000, 63000, 3000)).toBe(1);
    expect(fadeProgress(70000, 1000, 63000, 3000)).toBe(1);
  });
});
