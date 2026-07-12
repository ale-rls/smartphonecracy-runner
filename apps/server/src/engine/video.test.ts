import { describe, expect, it } from "vitest";
import { VIDEO_FALLBACK_GRACE_MS, VideoPhaseHandler } from "./video.js";

const identity = { sessionId: "session-1", phaseId: "intro", phaseEpoch: 4 };

describe("VideoPhaseHandler", () => {
  it("accepts only the active identity and completes once", () => {
    const video = new VideoPhaseHandler();
    video.begin(identity, 10_000, 1_000);

    expect(video.complete({ ...identity, phaseEpoch: 3 })).toBe(false);
    expect(video.complete(identity)).toBe(true);
    expect(video.complete(identity)).toBe(false);
  });

  it("falls back after expected duration plus five seconds, once", () => {
    const video = new VideoPhaseHandler();
    const fallbackAt = video.begin(identity, 10_000, 1_000);
    expect(fallbackAt).toBe(11_000 + VIDEO_FALLBACK_GRACE_MS);
    expect(video.consumeFallback(fallbackAt - 1)).toBeNull();
    expect(video.consumeFallback(fallbackAt)).toEqual(identity);
    expect(video.consumeFallback(fallbackAt + 1)).toBeNull();
  });

  it("cancels an obsolete phase", () => {
    const video = new VideoPhaseHandler();
    video.begin(identity, 10_000, 1_000);
    video.cancel();
    expect(video.complete(identity)).toBe(false);
    expect(video.consumeFallback(99_000)).toBeNull();
  });
});
