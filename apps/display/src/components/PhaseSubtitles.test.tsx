// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PhaseSnapshotMessage } from "@smartphonecracy/protocol";
import type { ServerClock } from "../lib/serverClock.js";
import { PhaseSubtitles } from "./PhaseSubtitles.js";

let root: Root | null = null;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("PhaseSubtitles", () => {
  it("renders timed subtitles for still-image and MP3 media phases", async () => {
    vi.useFakeTimers();
    const phase: Extract<PhaseSnapshotMessage, { kind: "video" }> = {
      kind: "video",
      id: "narrated-still",
      src: "portrait.png",
      audioSrc: "voice.mp3",
      expectedDurationMs: 10_000,
      next: "idle",
      subtitleStyle: { color: "#ff0000", fontSize: 3, bottomPercent: 12, backgroundOpacity: 0.5 },
      subtitles: [{ text: "A narrated still", startAtMs: 1_000, endAtMs: 2_000 }],
      scenarioVersion: "show-1",
      startedAt: 5_000,
      deadlineAt: 15_000,
    };
    let now = 5_500;
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.querySelector("#root")!);
    const clock = { now: () => now } as ServerClock;
    await act(async () => root?.render(<PhaseSubtitles phase={phase} clock={clock} />));

    expect(document.querySelector(".phase-subtitles")).toBeNull();
    now = 6_100;
    await act(async () => vi.advanceTimersByTime(100));
    expect(document.querySelector(".phase-subtitles")?.textContent).toBe("A narrated still");
    const overlay = document.querySelector<HTMLElement>(".phase-subtitles")!;
    expect(overlay.style.bottom).toBe("12%");
    expect(overlay.querySelector("p")!.style.color).toBe("rgb(255, 0, 0)");
    expect(overlay.querySelector("p")!.style.whiteSpace).toBe("pre-line");
    now = 7_000;
    await act(async () => vi.advanceTimersByTime(100));
    expect(document.querySelector(".phase-subtitles")).toBeNull();
  });
});
