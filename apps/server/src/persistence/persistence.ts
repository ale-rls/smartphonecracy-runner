import type { Scenario } from "@smartphonecracy/scenario";
import { resolveSnapshot, type FinalVoteSnapshot } from "../votes/index.js";
import type { PhaseCheckpoint } from "../engine/phase-engine.js";
import { PersistenceWriteQueue, type SqlStatement } from "./write-queue.js";

const DAY_MS = 86_400_000;

export type PersistenceOptions = {
  queue: PersistenceWriteQueue;
  installationId: string;
  scenario: Scenario;
  /** Closing date plus 90 days is the launch policy; supplied by deployment config. */
  participantDataExpiresAt: number;
};

const iso = (ms: number | null) => ms === null ? null : new Date(ms).toISOString();
const phaseRowId = (snapshot: FinalVoteSnapshot) => `${snapshot.sessionId}:${snapshot.phaseEpoch}`;

export class InstallationPersistence {
  private lastActiveSessionId: string | null = null;

  constructor(private readonly options: PersistenceOptions) {
    if (options.participantDataExpiresAt < Date.now() - 365 * DAY_MS) {
      throw new Error("participant retention deadline is implausibly old");
    }
    options.queue.enqueue([{
      text: `insert into scenarios (id,version,definition_json,status) values ($1,$2,$3,'deployed')
        on conflict (version) do update set definition_json=excluded.definition_json,status=excluded.status`,
      values: [options.scenario.version, options.scenario.version, JSON.stringify(options.scenario)],
    }]);
  }

  checkpoint(checkpoint: PhaseCheckpoint): void {
    const { scenario, installationId, participantDataExpiresAt } = this.options;
    if (checkpoint.sessionId !== "idle") this.lastActiveSessionId = checkpoint.sessionId;
    const sessionId = checkpoint.sessionId === "idle" ? this.lastActiveSessionId : checkpoint.sessionId;
    if (sessionId === null) return;
    const statements: SqlStatement[] = [{
      text: `insert into sessions (id, installation_id, scenario_id, status, started_at, ended_at, end_reason, current_phase_id, current_phase_epoch, current_phase_started_at, current_phase_deadline, participant_data_expires_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        on conflict (id) do update set status=excluded.status, ended_at=excluded.ended_at, end_reason=excluded.end_reason, current_phase_id=excluded.current_phase_id, current_phase_epoch=excluded.current_phase_epoch, current_phase_started_at=excluded.current_phase_started_at, current_phase_deadline=excluded.current_phase_deadline`,
      values: [sessionId, installationId, scenario.version, checkpoint.phaseId === "idle" ? "ended" : "active", iso(checkpoint.startedAt), checkpoint.phaseId === "idle" ? iso(checkpoint.startedAt) : null, checkpoint.phaseId === "idle" ? checkpoint.reason : null, checkpoint.phaseId, checkpoint.phaseEpoch, iso(checkpoint.startedAt), iso(checkpoint.deadlineAt), iso(participantDataExpiresAt)],
    }, {
      text: "insert into checkpoints (session_id, phase_id, phase_epoch, scenario_version, started_at, deadline_at, reason) values ($1,$2,$3,$4,$5,$6,$7)",
      values: [sessionId, checkpoint.phaseId, checkpoint.phaseEpoch, scenario.version, iso(checkpoint.startedAt), iso(checkpoint.deadlineAt), checkpoint.reason],
    }, {
      text: `insert into session_phases (id,session_id,phase_id,phase_index,started_at) values ($1,$2,$3,$4,$5)
        on conflict (id) do nothing`,
      values: [`${sessionId}:${checkpoint.phaseEpoch}`, sessionId, checkpoint.phaseId, checkpoint.phaseEpoch, iso(checkpoint.startedAt)],
    }];
    if (checkpoint.kind === "recovery") statements.push({
      text: "insert into events (session_id, type, payload_json) values ($1,'recovery',$2)",
      values: [sessionId, JSON.stringify({ reason: checkpoint.reason, phaseId: checkpoint.phaseId, phaseEpoch: checkpoint.phaseEpoch })],
    });
    this.options.queue.enqueue(statements);
  }

  voteSnapshot(snapshot: FinalVoteSnapshot): void {
    const phase = this.options.scenario.phases.find((candidate) => candidate.id === snapshot.questionId);
    if (!phase || phase.kind !== "position-question") throw new Error(`unknown persisted question ${snapshot.questionId}`);
    const resolution = resolveSnapshot(phase, snapshot);
    const includedByStatus: Record<string, number> = {};
    const excludedByStatus: Record<string, number> = {};
    const counted = new Set(phase.next.type === "quadrant-plurality" ? phase.next.countedStatuses : ["valid", "stale", "disconnected"]);
    for (const vote of snapshot.votes) {
      const target = counted.has(vote.status) && vote.status !== "never-moved" ? includedByStatus : excludedByStatus;
      target[vote.status] = (target[vote.status] ?? 0) + 1;
    }
    const outcome = {
      quadrantCounts: resolution.quadrantCounts,
      includedByStatus,
      excludedByStatus,
      includedTotal: Object.values(includedByStatus).reduce((a, b) => a + b, 0),
      excludedTotal: Object.values(excludedByStatus).reduce((a, b) => a + b, 0),
      winner: resolution.winner,
      resolvedTarget: resolution.resolvedTarget,
      countedStatuses: [...counted],
      boundaryConvention: "x=0.5 right; y=0.5 bottom; center q4",
    };
    const rowId = phaseRowId(snapshot);
    const statements: SqlStatement[] = [{
      text: `insert into session_phases (id,session_id,phase_id,phase_index,started_at,ended_at,question_text,x_axis_json,y_axis_json,outcome_json)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        on conflict (id) do update set ended_at=excluded.ended_at,question_text=excluded.question_text,x_axis_json=excluded.x_axis_json,y_axis_json=excluded.y_axis_json,outcome_json=excluded.outcome_json`,
      values: [rowId, snapshot.sessionId, phase.id, snapshot.phaseEpoch, iso(snapshot.votes[0]?.currentPhaseStartedAt ?? snapshot.recordedAt), iso(snapshot.recordedAt), phase.text, JSON.stringify(phase.xAxis), JSON.stringify(phase.yAxis), JSON.stringify(outcome)],
    }];
    for (const vote of snapshot.votes) statements.push({
      text: `insert into votes (session_phase_id,participant_id,x,y,status,last_input_at,recorded_at,metadata_json,retained_until)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (session_phase_id,participant_id) do nothing`,
      values: [rowId, vote.participantId, vote.x, vote.y, vote.status, iso(vote.lastInputAt), iso(vote.recordedAt), JSON.stringify({ lastHeartbeatAt: iso(vote.lastHeartbeatAt) }), iso(this.options.participantDataExpiresAt)],
    });
    this.options.queue.enqueue(statements);
  }

  deleteExpiredParticipantData(cutoff = Date.now()): void {
    this.options.queue.enqueue([{ text: "select delete_expired_participant_data($1)", values: [iso(cutoff)] }]);
  }

  flush(): Promise<void> { return this.options.queue.flush(); }
}
