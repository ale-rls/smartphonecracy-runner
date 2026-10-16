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
  const style = phase.subtitleStyle ?? {};
  const compact = style.fontFamily !== undefined;
  const background = style.background ?? "#000000";
  const rgb = [1, 3, 5].map((offset) => parseInt(background.slice(offset, offset + 2), 16)).join(" ");
  return <div className="phase-subtitles" aria-live="polite" style={{
      top: style.topPercent === undefined ? undefined : `${style.topPercent}%`,
      bottom: style.topPercent === undefined ? `${style.bottomPercent ?? 7}%` : "auto",
      textAlign: style.textAlign ?? "center", pointerEvents: "none",
    }}>{active.map((entry, index) => <p style={{
      whiteSpace: compact ? "normal" : "pre-line", color: style.color ?? "#ffffff",
      background: `rgb(${rgb} / ${style.backgroundOpacity ?? .72})`,
      fontFamily: style.fontFamily === "sans-serif" ? "Arial, Helvetica, sans-serif" : style.fontFamily === "show" ? "Leander, serif" : undefined,
      padding: compact ? ".12em .45em" : undefined,
      margin: compact ? ".1em auto" : undefined,
      maxWidth: compact ? "100%" : undefined,
      textShadow: compact ? "0 1px 2px rgb(0 0 0 / 85%), 0 0 5px rgb(0 0 0 / 45%)" : undefined,
      ...(style.fontSize === undefined ? {} : { fontSize: `${style.fontSize}cqw` }),
    }} key={`${entry.startAtMs}-${entry.endAtMs}-${index}`}>{entry.text}</p>)}</div>;
}
