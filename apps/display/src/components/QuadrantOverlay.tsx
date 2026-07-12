import type {
  QuadrantCounts,
  QuestionResolvedMessage,
} from "@smartphonecracy/protocol";

/**
 * Axis cross, pinned quadrant naming (q1 top-right, q2 top-left,
 * q3 bottom-left, q4 bottom-right — plan §5/§9), optional live counts,
 * and the winner/tie/empty highlight during the freeze hold.
 */

const QUADRANT_POSITIONS = {
  q1: "top-right",
  q2: "top-left",
  q3: "bottom-left",
  q4: "bottom-right",
} as const;

export function QuadrantOverlay({
  liveCounts,
  resolution,
}: {
  liveCounts: QuadrantCounts | null;
  resolution: QuestionResolvedMessage | null;
}) {
  // A fixed-transition resolution carries no quadrant outcome to
  // dramatize: freeze happens (freezeUntil is still honored upstream),
  // counts may render, but nothing is highlighted or dimmed.
  const winner =
    resolution === null || resolution.winner === "fixed"
      ? null
      : resolution.winner;
  return (
    <div className="quadrant-overlay">
      <div className="axis-cross" aria-hidden />
      {(Object.keys(QUADRANT_POSITIONS) as Array<keyof typeof QUADRANT_POSITIONS>).map(
        (q) => (
          <div
            key={q}
            className={[
              "quadrant",
              `quadrant-${QUADRANT_POSITIONS[q]}`,
              winner === q ? "quadrant-winner" : "",
              winner !== null && winner !== q ? "quadrant-dimmed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* Counts render only when the server chose to send them
                (showLiveCounts) or once the question resolved. */}
            {(resolution?.quadrantCounts ?? liveCounts) && (
              <span className="quadrant-count">
                {(resolution?.quadrantCounts ?? liveCounts)![q]}
              </span>
            )}
          </div>
        ),
      )}
      {winner === "tie" && <div className="outcome outcome-tie">tie</div>}
      {winner === "empty" && <div className="outcome outcome-empty" />}
    </div>
  );
}
