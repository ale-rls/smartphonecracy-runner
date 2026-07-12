import { afterEach, describe, expect, it, vi } from "vitest";
import { CURSOR_TICK_INTERVAL_MS, CursorPipeline } from "./cursor-pipeline.js";

describe("CursorPipeline", () => {
  afterEach(() => vi.useRealTimers());

  it("stores only the latest sequenced, finite, clamped position", () => {
    const batches: unknown[] = [];
    const pipeline = new CursorPipeline({ sendCursors: (message) => batches.push(message), sendPresence: () => {} });
    pipeline.join("p1", "#abc");
    expect(pipeline.recordInput("p1", 1, -0.2, 1.4)).toBe(true);
    expect(pipeline.recordInput("p1", 1, 0.2, 0.2)).toBe(false);
    expect(pipeline.recordInput("p1", 0, 0.3, 0.3)).toBe(false);
    expect(pipeline.recordInput("p1", 2, Number.NaN, 0.3)).toBe(false);
    expect(pipeline.recordInput("missing", 2, 0.3, 0.3)).toBe(false);
    pipeline.tick();
    expect(batches).toEqual([{ t: "cursors", v: 1, tick: 0, cursors: [
      { clientId: "p1", color: "#abc", x: 0, y: 1 },
    ] }]);
  });

  it("emits presence only when membership changes", () => {
    const counts: number[] = [];
    const pipeline = new CursorPipeline({ sendCursors: () => {}, sendPresence: (message) => counts.push(message.count) });
    pipeline.join("p1", "red");
    pipeline.join("p1", "blue");
    pipeline.join("p2", "green");
    pipeline.leave("missing");
    pipeline.leave("p1");
    expect(counts).toEqual([1, 2, 1]);
  });

  it("batches the complete latest store at 25 Hz", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const pipeline = new CursorPipeline({ sendCursors: (message) => ticks.push(message.tick), sendPresence: () => {} });
    pipeline.start();
    pipeline.start();
    vi.advanceTimersByTime(CURSOR_TICK_INTERVAL_MS * 3);
    pipeline.stop();
    vi.advanceTimersByTime(CURSOR_TICK_INTERVAL_MS);
    expect(ticks).toEqual([0, 1, 2]);
  });
});
