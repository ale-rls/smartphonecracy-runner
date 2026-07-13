import type {
  QuestionResolvedMessage,
  QuestionStatusMessage,
} from "@smartphonecracy/protocol";
import type { Axis, PositionField } from "@smartphonecracy/scenario";

export type AxisLabels = Axis;
export type QuestionField = PositionField;

type FourQuadrant = "q1" | "q2" | "q3" | "q4";
type TwoQuadrant = "min" | "max";
type FourQuadrantCounts = Record<FourQuadrant, number>;
type TwoQuadrantCounts = Record<TwoQuadrant, number>;
type PositionCounts = NonNullable<QuestionStatusMessage["quadrantCounts"]>;

const FOUR_QUADRANT_POSITIONS: Record<FourQuadrant, string> = {
  q1: "top-right",
  q2: "top-left",
  q3: "bottom-left",
  q4: "bottom-right",
};

const TWO_QUADRANT_POSITIONS = {
  x: { min: "left", max: "right" },
  y: { min: "top", max: "bottom" },
} as const;

function isFourQuadrantCounts(
  counts: PositionCounts,
): counts is PositionCounts & FourQuadrantCounts {
  return "q1" in counts && "q2" in counts && "q3" in counts && "q4" in counts;
}

function isTwoQuadrantCounts(
  counts: PositionCounts,
): counts is PositionCounts & TwoQuadrantCounts {
  return "min" in counts && "max" in counts;
}

function sameField(left: QuestionField, right: QuestionField): boolean {
  return (
    left.type === right.type &&
    (left.type === "four-quadrant" ||
      (right.type === "two-quadrant" && left.axis === right.axis))
  );
}

function Axis({ axis, labels }: { axis: "x" | "y"; labels: AxisLabels }) {
  return (
    <div className={`axis axis-${axis}`} data-active-axis={axis}>
      <span>{labels.minLabel}</span>
      <span>{labels.maxLabel}</span>
    </div>
  );
}

function Region({
  id,
  position,
  count,
  winner,
}: {
  id: FourQuadrant | TwoQuadrant;
  position: string;
  count: number | null;
  winner: string | null;
}) {
  return (
    <div
      className={[
        "quadrant",
        `quadrant-${position}`,
        winner === id ? "quadrant-winner" : "",
        winner !== null && winner !== id ? "quadrant-dimmed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-quadrant={id}
    >
      {count !== null && <span className="quadrant-count">{count}</span>}
    </div>
  );
}

/**
 * Spatial question field with pinned four-quadrant naming and two-quadrant
 * min/max naming. Two-quadrant X fields split left/right; Y fields split
 * top/bottom. The server remains the resolution oracle: this component only
 * renders the field, counts, and the frozen outcome it receives.
 */
export function QuadrantOverlay({
  field,
  liveField,
  liveCounts,
  resolution,
}: {
  field: QuestionField;
  liveField: QuestionField | null;
  liveCounts: PositionCounts | null;
  resolution: QuestionResolvedMessage | null;
}) {
  const resolutionMatches =
    resolution !== null && sameField(field, resolution.field);
  const resolvedCounts = resolutionMatches ? resolution.quadrantCounts : null;
  const matchingLiveCounts =
    liveField !== null && sameField(field, liveField) ? liveCounts : null;
  const countSource = resolution === null ? matchingLiveCounts : resolvedCounts;
  const winner =
    !resolutionMatches || resolution.winner === "fixed"
      ? null
      : resolution.winner;

  if (field.type === "four-quadrant") {
    const counts =
      countSource !== null && isFourQuadrantCounts(countSource)
        ? countSource
        : null;
    return (
      <>
        <Axis axis="x" labels={field.xAxis} />
        <Axis axis="y" labels={field.yAxis} />
        <div className="quadrant-overlay quadrant-overlay-four-quadrant">
          <div className="axis-cross" aria-hidden />
          {(Object.keys(FOUR_QUADRANT_POSITIONS) as FourQuadrant[]).map((id) => (
            <Region
              key={id}
              id={id}
              position={FOUR_QUADRANT_POSITIONS[id]}
              count={counts?.[id] ?? null}
              winner={winner}
            />
          ))}
          {winner === "tie" && <div className="outcome outcome-tie">tie</div>}
          {winner === "empty" && <div className="outcome outcome-empty" />}
        </div>
      </>
    );
  }

  const counts =
    countSource !== null && isTwoQuadrantCounts(countSource) ? countSource : null;
  const positions = TWO_QUADRANT_POSITIONS[field.axis];
  return (
    <>
      <Axis axis={field.axis} labels={field.labels} />
      <div
        className={`quadrant-overlay quadrant-overlay-two-quadrant quadrant-overlay-axis-${field.axis}`}
      >
        <div className={`axis-divider axis-divider-${field.axis}`} aria-hidden />
        {(["min", "max"] as const).map((id) => (
          <Region
            key={id}
            id={id}
            position={positions[id]}
            count={counts?.[id] ?? null}
            winner={winner}
          />
        ))}
        {winner === "tie" && <div className="outcome outcome-tie">tie</div>}
        {winner === "empty" && <div className="outcome outcome-empty" />}
      </div>
    </>
  );
}
