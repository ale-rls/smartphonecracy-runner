import type {
  CountablePositionVoteStatus,
  PositionQuestionPhase,
  PositionVoteStatus,
} from "@smartphonecracy/scenario";
import { quadrantOf, type Quadrant } from "@smartphonecracy/shared";
import type { QuadrantCounts } from "@smartphonecracy/protocol";

export type VoteParticipantSeed = {
  participantId: string;
  connected: boolean;
  lastHeartbeatAt: number | null;
};

export type PositionVote = {
  sessionId: string;
  questionId: string;
  participantId: string;
  x: number | null;
  y: number | null;
  status: PositionVoteStatus;
  lastInputAt: number | null;
  lastHeartbeatAt: number | null;
  currentPhaseStartedAt: number;
  currentPhaseDeadline: number;
  recordedAt: number;
};

export type FinalVoteSnapshot = {
  sessionId: string;
  questionId: string;
  phaseEpoch: number;
  recordedAt: number;
  votes: readonly PositionVote[];
};

export type VoteResolution = {
  snapshot: FinalVoteSnapshot;
  quadrantCounts: QuadrantCounts;
  winner: Quadrant | "tie" | "empty";
  resolvedTarget: string;
};

export type LiveQuestionStatus = {
  connectedCount: number;
  positionedCount: number;
  quadrantCounts: QuadrantCounts;
};

type MutableVote = {
  participantId: string;
  connected: boolean;
  x: number | null;
  y: number | null;
  lastInputAt: number | null;
  lastHeartbeatAt: number | null;
};

const QUADRANTS: readonly Quadrant[] = ["q1", "q2", "q3", "q4"];

function emptyCounts(): QuadrantCounts {
  return { q1: 0, q2: 0, q3: 0, q4: 0 };
}

function clampCoordinate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function statusOf(vote: MutableVote, now: number, staleAfterMs: number): PositionVoteStatus {
  if (!vote.connected) return "disconnected";
  if (vote.x === null || vote.y === null) return "never-moved";
  if (vote.lastHeartbeatAt === null || now - vote.lastHeartbeatAt >= staleAfterMs) return "stale";
  return "valid";
}

function freezeVote(vote: PositionVote): PositionVote {
  return Object.freeze(vote);
}

/**
 * Resolve an immutable final snapshot. This is deliberately a pure resolver:
 * fixed transitions do not inspect positions or call quadrantOf at all.
 */
export function resolveSnapshot(
  question: PositionQuestionPhase,
  snapshot: FinalVoteSnapshot,
): Omit<VoteResolution, "snapshot"> {
  if (question.next.type === "fixed") {
    return {
      quadrantCounts: emptyCounts(),
      winner: "empty",
      resolvedTarget: question.next.target,
    };
  }

  const counts = emptyCounts();
  const counted = new Set<CountablePositionVoteStatus>(question.next.countedStatuses);
  for (const vote of snapshot.votes) {
    if (vote.status === "never-moved" || !counted.has(vote.status) || vote.x === null || vote.y === null) continue;
    const quadrant = quadrantOf(vote.x, vote.y);
    counts[quadrant] += 1;
  }

  const total = QUADRANTS.reduce((sum, quadrant) => sum + counts[quadrant], 0);
  if (total === 0) {
    return { quadrantCounts: counts, winner: "empty", resolvedTarget: question.next.empty };
  }

  const highest = Math.max(...QUADRANTS.map((quadrant) => counts[quadrant]));
  const winners = QUADRANTS.filter((quadrant) => counts[quadrant] === highest);
  if (winners.length !== 1) {
    return { quadrantCounts: counts, winner: "tie", resolvedTarget: question.next.tie };
  }
  const winner = winners[0]!;
  return { quadrantCounts: counts, winner, resolvedTarget: question.next.map[winner] };
}

export class VoteEngine {
  private readonly onSnapshotEnqueued: ((snapshot: FinalVoteSnapshot) => void) | undefined;
  private readonly heartbeatTimes = new Map<string, number>();
  private question: {
    sessionId: string;
    question: PositionQuestionPhase;
    phaseEpoch: number;
    phaseStartedAt: number;
    phaseDeadline: number;
    votes: Map<string, MutableVote>;
    finalized: FinalVoteSnapshot | null;
    resolution: VoteResolution | null;
  } | null = null;
  private _lastSnapshot: FinalVoteSnapshot | null = null;

  constructor(options: { onSnapshotEnqueued?: (snapshot: FinalVoteSnapshot) => void } = {}) {
    this.onSnapshotEnqueued = options.onSnapshotEnqueued;
  }

  get lastSnapshot(): FinalVoteSnapshot | null {
    return this._lastSnapshot;
  }

  beginQuestion(options: {
    sessionId: string;
    question: PositionQuestionPhase;
    phaseEpoch: number;
    phaseStartedAt: number;
    phaseDeadline: number;
    participants: readonly VoteParticipantSeed[];
  }): void {
    const votes = new Map<string, MutableVote>();
    for (const participant of options.participants) {
      const heartbeat = this.heartbeatTimes.get(participant.participantId) ?? participant.lastHeartbeatAt;
      if (heartbeat !== null) this.heartbeatTimes.set(participant.participantId, heartbeat);
      votes.set(participant.participantId, {
        participantId: participant.participantId,
        connected: participant.connected,
        x: null,
        y: null,
        lastInputAt: null,
        lastHeartbeatAt: heartbeat,
      });
    }
    this.question = {
      sessionId: options.sessionId,
      question: options.question,
      phaseEpoch: options.phaseEpoch,
      phaseStartedAt: options.phaseStartedAt,
      phaseDeadline: options.phaseDeadline,
      votes,
      finalized: null,
      resolution: null,
    };
  }

  addParticipant(participant: VoteParticipantSeed, now: number): void {
    const question = this.question;
    if (!question || question.finalized !== null || now >= question.phaseDeadline) return;
    const heartbeat = this.heartbeatTimes.get(participant.participantId)
      ?? participant.lastHeartbeatAt
      ?? now;
    this.heartbeatTimes.set(participant.participantId, heartbeat);
    const existing = question.votes.get(participant.participantId);
    if (existing) {
      existing.connected = participant.connected;
      existing.lastHeartbeatAt = heartbeat;
      return;
    }
    question.votes.set(participant.participantId, {
      participantId: participant.participantId,
      connected: participant.connected,
      x: null,
      y: null,
      lastInputAt: null,
      lastHeartbeatAt: heartbeat,
    });
  }

  recordHeartbeat(participantId: string, now: number): boolean {
    this.heartbeatTimes.set(participantId, now);
    const question = this.question;
    if (!question || question.finalized !== null || now >= question.phaseDeadline) return false;
    const vote = question.votes.get(participantId);
    if (!vote) return false;
    vote.connected = true;
    vote.lastHeartbeatAt = now;
    return true;
  }

  recordInput(participantId: string, x: number, y: number, now: number): boolean {
    const question = this.question;
    if (!question || question.finalized !== null || now >= question.phaseDeadline) return false;
    const vote = question.votes.get(participantId);
    if (!vote) return false;
    vote.connected = true;
    vote.x = clampCoordinate(x);
    vote.y = clampCoordinate(y);
    vote.lastInputAt = now;
    return true;
  }

  setConnected(participantId: string, connected: boolean, now: number): boolean {
    const question = this.question;
    if (!question || question.finalized !== null || now >= question.phaseDeadline) return false;
    const vote = question.votes.get(participantId);
    if (!vote) return false;
    vote.connected = connected;
    return true;
  }

  liveStatus(now: number): LiveQuestionStatus | null {
    const question = this.question;
    if (!question) return null;
    const status = this.statusForVotes(question.votes.values(), now, question.question.connectionStaleAfterMs);
    const counts = this.countVotes(question.votes.values(), status, question.question.next);
    let connectedCount = 0;
    let positionedCount = 0;
    for (const vote of question.votes.values()) {
      if (vote.connected) connectedCount += 1;
      if (vote.x !== null && vote.y !== null) positionedCount += 1;
    }
    return { connectedCount, positionedCount, quadrantCounts: counts };
  }

  finalize(now: number): VoteResolution | null {
    const question = this.question;
    if (!question) return null;
    if (question.resolution) return question.resolution;

    const recordedAt = Math.min(now, question.phaseDeadline);
    const votes = [...this.snapshotVotes(question.votes.values(), recordedAt, question.question.connectionStaleAfterMs, question)];
    const snapshot: FinalVoteSnapshot = Object.freeze({
      sessionId: question.sessionId,
      questionId: question.question.id,
      phaseEpoch: question.phaseEpoch,
      recordedAt,
      votes: Object.freeze(votes),
    });
    // Mark it final before the hook so a synchronous persistence enqueue cannot
    // accidentally re-enter and mutate the live question.
    question.finalized = snapshot;
    this._lastSnapshot = snapshot;
    this.onSnapshotEnqueued?.(snapshot);

    const resolved = resolveSnapshot(question.question, snapshot);
    const resolution: VoteResolution = { snapshot, ...resolved };
    question.resolution = resolution;
    return resolution;
  }

  currentResolution(): VoteResolution | null {
    return this.question?.resolution ?? null;
  }

  currentQuestion(): PositionQuestionPhase | null {
    return this.question?.question ?? null;
  }

  clearQuestion(): void {
    this.question = null;
  }

  private statusForVotes(
    votes: Iterable<MutableVote>,
    now: number,
    staleAfterMs: number,
  ): Map<string, PositionVoteStatus> {
    const statuses = new Map<string, PositionVoteStatus>();
    for (const vote of votes) statuses.set(vote.participantId, statusOf(vote, now, staleAfterMs));
    return statuses;
  }

  private countVotes(
    votes: Iterable<MutableVote>,
    statuses: Map<string, PositionVoteStatus>,
    next: PositionQuestionPhase["next"],
  ): QuadrantCounts {
    const counts = emptyCounts();
    if (next.type !== "quadrant-plurality") return counts;
    const counted = new Set<CountablePositionVoteStatus>(next.countedStatuses);
    for (const vote of votes) {
      const status = statuses.get(vote.participantId);
      if (!status || status === "never-moved" || !counted.has(status) || vote.x === null || vote.y === null) continue;
      counts[quadrantOf(vote.x, vote.y)] += 1;
    }
    return counts;
  }

  private snapshotVotes(
    votes: Iterable<MutableVote>,
    recordedAt: number,
    staleAfterMs: number,
    question: NonNullable<VoteEngine["question"]>,
  ): PositionVote[] {
    const materialized = [...votes];
    const statuses = this.statusForVotes(materialized, recordedAt, staleAfterMs);
    return materialized.map((vote) => freezeVote({
      sessionId: question.sessionId,
      questionId: question.question.id,
      participantId: vote.participantId,
      x: vote.x,
      y: vote.y,
      status: statuses.get(vote.participantId)!,
      lastInputAt: vote.lastInputAt,
      lastHeartbeatAt: vote.lastHeartbeatAt,
      currentPhaseStartedAt: question.phaseStartedAt,
      currentPhaseDeadline: question.phaseDeadline,
      recordedAt,
    }));
  }
}
