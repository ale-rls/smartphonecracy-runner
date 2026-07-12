import { QUADRANTS, quadrantOf, type Quadrant } from "./index.js";

export type QuadrantCounts = Record<Quadrant, number>;

export type PositionedVote<Status extends string = string> = {
  x: number | null;
  y: number | null;
  status: Status;
};

export type PositionStatus = "valid" | "stale" | "disconnected" | "never-moved";

export function materializePositionStatus(vote: {
  connected: boolean;
  x: number | null;
  y: number | null;
  lastHeartbeatAt: number | null;
}, now: number, staleAfterMs: number): PositionStatus {
  if (!vote.connected) return "disconnected";
  if (vote.x === null || vote.y === null) return "never-moved";
  if (vote.lastHeartbeatAt === null || now - vote.lastHeartbeatAt >= staleAfterMs) return "stale";
  return "valid";
}

export type VoteClassification<Status extends string> = {
  quadrantCounts: QuadrantCounts;
  includedByStatus: Partial<Record<Status, number>>;
  excludedByStatus: Partial<Record<Status, number>>;
  includedTotal: number;
  excludedTotal: number;
};

export function classifyPositionVotes<Status extends string>(
  votes: readonly PositionedVote<Status>[], countedStatuses: ReadonlySet<Status>,
): VoteClassification<Status> {
  const quadrantCounts: QuadrantCounts = { q1: 0, q2: 0, q3: 0, q4: 0 };
  const includedByStatus: Partial<Record<Status, number>> = {};
  const excludedByStatus: Partial<Record<Status, number>> = {};
  let includedTotal = 0;
  let excludedTotal = 0;
  for (const vote of votes) {
    const included = vote.x !== null && vote.y !== null && countedStatuses.has(vote.status);
    const totals = included ? includedByStatus : excludedByStatus;
    totals[vote.status] = (totals[vote.status] ?? 0) + 1;
    if (included) {
      includedTotal += 1;
      quadrantCounts[quadrantOf(vote.x!, vote.y!)] += 1;
    } else excludedTotal += 1;
  }
  return { quadrantCounts, includedByStatus, excludedByStatus, includedTotal, excludedTotal };
}

export type PluralityOutcome =
  | { winner: Quadrant; quadrantCounts: QuadrantCounts }
  | { winner: "tie" | "empty"; quadrantCounts: QuadrantCounts };

export function resolveFixedTransition<Status extends string>(
  votes: readonly PositionedVote<Status>[], resolvedTarget: string,
): { winner: "fixed"; quadrantCounts: QuadrantCounts; resolvedTarget: string } {
  return { winner: "fixed", quadrantCounts: countQuadrants(votes), resolvedTarget };
}

export function countQuadrants<Status extends string>(
  votes: readonly PositionedVote<Status>[],
  countedStatuses?: ReadonlySet<Status>,
): QuadrantCounts {
  const counts: QuadrantCounts = { q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const vote of votes) {
    if (vote.x === null || vote.y === null) continue;
    if (countedStatuses !== undefined && !countedStatuses.has(vote.status)) continue;
    counts[quadrantOf(vote.x, vote.y)] += 1;
  }
  return counts;
}

export function resolveQuadrantPlurality<Status extends string>(
  votes: readonly PositionedVote<Status>[],
  countedStatuses: ReadonlySet<Status>,
): PluralityOutcome {
  const quadrantCounts = classifyPositionVotes(votes, countedStatuses).quadrantCounts;
  const highest = Math.max(...QUADRANTS.map((quadrant) => quadrantCounts[quadrant]));
  if (highest === 0) return { winner: "empty", quadrantCounts };

  const winners = QUADRANTS.filter((quadrant) => quadrantCounts[quadrant] === highest);
  return winners.length === 1
    ? { winner: winners[0]!, quadrantCounts }
    : { winner: "tie", quadrantCounts };
}
