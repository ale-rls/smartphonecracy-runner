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

export const QUADRANTS = ["q1", "q2", "q3", "q4"] as const;
export type Quadrant = (typeof QUADRANTS)[number];

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
