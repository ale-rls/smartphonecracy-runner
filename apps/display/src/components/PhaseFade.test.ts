import { describe, expect, it } from "vitest";
import { fadeProgress } from "./PhaseFade.js";
describe("credits fade", () => {
  it("holds picture and audio until 70 seconds and reaches black at 73, including late reconnects", () => {
    expect(fadeProgress(69000, 1000, 73000, 3000)).toBe(0);
    expect(fadeProgress(71000, 1000, 73000, 3000)).toBe(0);
    expect(fadeProgress(72500, 1000, 73000, 3000)).toBe(0.5);
    expect(fadeProgress(74000, 1000, 73000, 3000)).toBe(1);
    expect(fadeProgress(80000, 1000, 73000, 3000)).toBe(1);
  });
});
