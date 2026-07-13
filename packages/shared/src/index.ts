/**
 * Shared constants for the smartphonecracy installation.
 * Values mirror the locked defaults in the implementation plan (§5).
 * Director-configurable values live in InstallationPolicy at runtime;
 * these are the v1 defaults.
 */

export const DEFAULT_INSTALLATION_POLICY = {
  maxParticipants: 30,
  qrRotationMs: 60_000,
  joinGrantTtlMs: 120_000,
  participantLeaseTtlMs: 7_200_000,
  allowLateJoin: true,
  activeQrVisibility: "corner",
  lobbyCountdownMs: 10_000,
  minParticipants: 1,
  interactiveIdleTimeoutMs: 180_000,
  maxSessionDurationMs: 1_800_000,
} as const;

/** v1 media manifest ceiling in bytes (plan §5). */
export const MEDIA_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

/** Server-side fallback slack after a video's expected duration (plan §9). */
export const VIDEO_END_TIMEOUT_SLACK_MS = 5_000;

export type Axis = {
  minLabel: string;
  maxLabel: string;
};

export const FOUR_QUADRANTS = ["q1", "q2", "q3", "q4"] as const;
export const TWO_QUADRANTS = ["min", "max"] as const;

/** Compatibility name for the original four-quadrant-only API. */
export const QUADRANTS = FOUR_QUADRANTS;

export type FourQuadrant = (typeof FOUR_QUADRANTS)[number];
export type TwoQuadrant = (typeof TWO_QUADRANTS)[number];
/** Compatibility type for the original four-quadrant-only API. */
export type Quadrant = FourQuadrant;

export type FourQuadrantField = {
  type: "four-quadrant";
  xAxis: Axis;
  yAxis: Axis;
};

export type TwoQuadrantField = {
  type: "two-quadrant";
  axis: "x" | "y";
  labels: Axis;
};

export type PositionField = FourQuadrantField | TwoQuadrantField;

export type PositionQuadrant<Field extends PositionField = PositionField> =
  Field extends FourQuadrantField ? FourQuadrant : TwoQuadrant;

export type PositionQuadrantCounts<Field extends PositionField = PositionField> =
  Field extends FourQuadrantField
    ? Record<FourQuadrant, number>
    : Record<TwoQuadrant, number>;

/**
 * Quadrant assignment for a normalized position (0..1, y grows downward).
 * Half-open boundary convention (plan §5): x = 0.5 belongs to the right
 * half, y = 0.5 belongs to the bottom half, so the exact center is q4.
 */
export function quadrantOf(x: number, y: number): Quadrant {
  const right = x >= 0.5;
  const bottom = y >= 0.5;
  if (right) return bottom ? "q4" : "q1";
  return bottom ? "q3" : "q2";
}

/**
 * Assign a normalized position to one of the field's spatial quadrants.
 * The exact 0.5 boundary belongs to the max side: right for x, bottom for y.
 */
export function quadrantOfField(field: FourQuadrantField, x: number, y: number): FourQuadrant;
export function quadrantOfField(field: TwoQuadrantField, x: number, y: number): TwoQuadrant;
export function quadrantOfField(field: PositionField, x: number, y: number): PositionQuadrant;
export function quadrantOfField(field: PositionField, x: number, y: number): PositionQuadrant {
  if (field.type === "four-quadrant") return quadrantOf(x, y);
  const coordinate = field.axis === "x" ? x : y;
  return coordinate >= 0.5 ? "max" : "min";
}

export function quadrantsOfField(field: FourQuadrantField): typeof FOUR_QUADRANTS;
export function quadrantsOfField(field: TwoQuadrantField): typeof TWO_QUADRANTS;
export function quadrantsOfField(field: PositionField): typeof FOUR_QUADRANTS | typeof TWO_QUADRANTS;
export function quadrantsOfField(field: PositionField): typeof FOUR_QUADRANTS | typeof TWO_QUADRANTS {
  return field.type === "four-quadrant" ? FOUR_QUADRANTS : TWO_QUADRANTS;
}

export * from "./resolution.js";
