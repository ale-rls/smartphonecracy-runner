import { useEffect, useState, type RefObject } from "react";
import type { PhaseSnapshotMessage } from "@smartphonecracy/protocol";
import type { ServerClock } from "../lib/serverClock.js";

export function fadeProgress(now: number, startedAt: number, durationMs: number, fadeOutMs: number): number {
  return Math.min(1, Math.max(0, (now - startedAt - durationMs + fadeOutMs) / fadeOutMs));
}

/** One clock fades picture, cursors and audio together before the server ends the session. */
export function PhaseFade({ phase, clock, media, extraAudio }: {
  phase: PhaseSnapshotMessage | null; clock: ServerClock;
  media: RefObject<HTMLMediaElement | null>; extraAudio: RefObject<HTMLAudioElement | null>;
}) {
  const [opacity, setOpacity] = useState(0);
  const fade = phase?.kind === "video" ? phase.fadeOutMs : undefined;
  const startedAt = phase?.startedAt ?? 0;
  const duration = phase?.kind === "video" ? phase.expectedDurationMs : 0;
  useEffect(() => {
    let id = 0;
    const touched = new Set<HTMLMediaElement>();
    const update = () => {
      const value = fade === undefined ? 0 : fadeProgress(clock.now(), startedAt, duration, fade);
      setOpacity(value);
      for (const element of [media.current, extraAudio.current]) {
        if (element) { element.volume = 1 - value; touched.add(element); }
      }
      id = requestAnimationFrame(update);
    };
    update();
    return () => { cancelAnimationFrame(id); for (const element of touched) element.volume = 1; };
  }, [clock, fade, startedAt, duration, media, extraAudio]);
  return <div aria-hidden="true" className={phase?.kind === "idle" ? "venue-return-from-black" : undefined}
    style={{ position: "absolute", inset: 0, background: "black", zIndex: 4, pointerEvents: "none", opacity }} />;
}
