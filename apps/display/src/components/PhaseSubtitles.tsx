import { useEffect, useState } from "react";
import type { PhaseSnapshotMessage } from "@smartphonecracy/protocol";
import type { ServerClock } from "../lib/serverClock.js";

type MediaPhase = Extract<PhaseSnapshotMessage, { kind: "video" | "video-position-question" }>;

export function PhaseSubtitles({ phase, clock }: { phase: MediaPhase; clock: ServerClock }) {
  const [elapsed, setElapsed] = useState(() => clock.now() - phase.startedAt);
  useEffect(() => {
    const update = () => setElapsed(clock.now() - phase.startedAt);
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [clock, phase.id, phase.startedAt]);
  const active = phase.subtitles?.filter((entry) => elapsed >= entry.startAtMs && elapsed < entry.endAtMs) ?? [];
  if (active.length === 0) return null;
  const style = phase.subtitleStyle;
  const background = style?.background ?? "#000000";
  const rgb = [1, 3, 5].map((offset) => parseInt(background.slice(offset, offset + 2), 16)).join(" ");
  return <div className="phase-subtitles" aria-live="polite" style={{ bottom: `${style?.bottomPercent ?? 7}%`, textAlign: style?.textAlign ?? "center", pointerEvents: "none" }}>{active.map((entry, index) => <p style={{ whiteSpace: "pre-line", color: style?.color ?? "#ffffff", background: `rgb(${rgb} / ${style?.backgroundOpacity ?? .72})`, ...(style?.fontSize === undefined ? {} : { fontSize: `${style.fontSize}cqw` }) }} key={`${entry.startAtMs}-${entry.endAtMs}-${index}`}>{entry.text}</p>)}</div>;
}
