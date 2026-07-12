import { classifyPositionVotes, resolveFixedTransition, resolveQuadrantPlurality, type PositionStatus, type PositionedVote, type Quadrant } from "../../../../packages/shared/src/index.js";
import type { StudioProject } from "@smartphonecracy/studio-adapter";
import { diagnostics, type Diagnostic } from "../diagnostics/diagnostics.js";

type Phase = StudioProject["scenario"]["phases"][number];
export type ForcedOutcome = Quadrant | "tie" | "empty" | "abandoned-solo";
export type PreviewVote = PositionedVote<PositionStatus> & { participantId: string };
export type PreviewResolution = { votes: PreviewVote[]; includedTotal: number; excludedTotal: number; includedByStatus: Partial<Record<PositionStatus, number>>; excludedByStatus: Partial<Record<PositionStatus, number>>; quadrantCounts: Record<Quadrant, number>; winner: Quadrant | "tie" | "empty" | "fixed"; resolvedTarget: string; freezeMs: number };
export type PreviewSession = { project: StudioProject; phaseId: string; elapsedMs: number; validation: Diagnostic[]; resolution?: PreviewResolution };

export function startPreview(project: StudioProject): PreviewSession {
  const validation = diagnostics(project);
  const errors = validation.filter((item) => item.severity === "error");
  if (errors.length) throw new Error(`Preview blocked: ${errors.map((item) => item.message).join("; ")}`);
  return { project, phaseId: project.scenario.entryPhaseId, elapsedMs: 0, validation };
}
export const currentPhase = (session: PreviewSession): Phase => {
  const phase = session.project.scenario.phases.find((item) => item.id === session.phaseId);
  if (!phase) throw new Error(`Preview phase “${session.phaseId}” does not exist.`);
  return phase;
};
export function advancePreview(session: PreviewSession): PreviewSession {
  const phase = currentPhase(session);
  if (phase.kind === "idle") return session;
  let target: string;
  if (phase.kind === "video") target = phase.next;
  else {
    if (phase.next.type !== "fixed") throw new Error("Choose an outcome for this question.");
    target = phase.next.target;
  }
  const { resolution: _resolution, ...rest } = session;
  return { ...rest, phaseId: target, elapsedMs: 0 };
}
export function advanceTimer(session: PreviewSession, milliseconds: number): PreviewSession {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("Timer advance must be non-negative.");
  return { ...session, elapsedMs: session.elapsedMs + milliseconds };
}
const point: Record<Quadrant, [number, number]> = { q1: [0.75, 0.25], q2: [0.25, 0.25], q3: [0.25, 0.75], q4: [0.75, 0.75] };
export function outcomeVotes(outcome: ForcedOutcome, includeStale: boolean, includeDisconnected: boolean): PreviewVote[] {
  if (outcome === "empty") return [{ participantId: "never-moved", x: null, y: null, status: "never-moved" }];
  if (outcome === "abandoned-solo") return [{ participantId: "solo", x: 0.75, y: 0.75, status: "disconnected" }];
  const winners: Quadrant[] = outcome === "tie" ? ["q1", "q2"] : [outcome];
  const votes: PreviewVote[] = winners.map((quadrant, index) => ({ participantId: `valid-${index + 1}`, x: point[quadrant][0], y: point[quadrant][1], status: "valid" }));
  const staleQuadrant = outcome === "tie" ? "q1" : outcome;
  const disconnectedQuadrant = outcome === "tie" ? "q2" : outcome;
  if (includeStale) votes.push({ participantId: "stale", x: point[staleQuadrant][0], y: point[staleQuadrant][1], status: "stale" });
  if (includeDisconnected) votes.push({ participantId: "disconnected", x: point[disconnectedQuadrant][0], y: point[disconnectedQuadrant][1], status: "disconnected" });
  return votes;
}
export function resolvePreview(session: PreviewSession, outcome: ForcedOutcome, includeStale = true, includeDisconnected = true): PreviewSession {
  const phase = currentPhase(session);
  if (phase.kind !== "position-question") throw new Error("Only position questions have outcomes.");
  const votes: PreviewVote[] = outcomeVotes(outcome, includeStale, includeDisconnected);
  const counted = new Set<PositionStatus>(phase.next.type === "quadrant-plurality" ? phase.next.countedStatuses : ["valid", "stale", "disconnected"]);
  const classification = classifyPositionVotes(votes, counted);
  const resolved = phase.next.type === "fixed" ? resolveFixedTransition(votes, phase.next.target) : (() => {
    const result = resolveQuadrantPlurality(votes, counted);
    const resolvedTarget = result.winner === "tie" ? phase.next.tie : result.winner === "empty" ? phase.next.empty : phase.next.map[result.winner];
    return { ...result, resolvedTarget };
  })();
  return { ...session, resolution: { votes, ...classification, quadrantCounts: resolved.quadrantCounts, winner: resolved.winner, resolvedTarget: resolved.resolvedTarget, freezeMs: phase.freezeMs } };
}
export function continueAfterResolution(session: PreviewSession): PreviewSession {
  if (!session.resolution) throw new Error("Resolve the question first.");
  const { resolution, ...rest } = session;
  return { ...rest, phaseId: resolution.resolvedTarget, elapsedMs: 0 };
}
