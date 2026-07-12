import {
  encodeMessage,
  type ClientToServerMessage,
  type PhaseSnapshotMessage,
  type ServerToClientMessage,
} from "@smartphonecracy/protocol";
import type { Scenario, Phase } from "@smartphonecracy/scenario";
import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import type { ParticipantRecord, ParticipantRegistry } from "../admission/index.js";

export type EngineLifecycle = "idle" | "lobby" | "active";

export type PhaseEnginePolicy = {
  lobbyCountdownMs: number;
  interactiveIdleTimeoutMs: number;
  maxSessionDurationMs: number;
  displayDisconnectTimeoutMs: number;
  noParticipantGraceMs: number;
};

export const DEFAULT_PHASE_ENGINE_POLICY: PhaseEnginePolicy = {
  lobbyCountdownMs: 10_000,
  interactiveIdleTimeoutMs: 180_000,
  maxSessionDurationMs: 1_800_000,
  displayDisconnectTimeoutMs: 30_000,
  noParticipantGraceMs: 120_000,
};

export type PhaseCheckpoint = {
  kind: "transition" | "recovery";
  reason: string;
  sessionId: string;
  phaseId: string;
  phaseEpoch: number;
  startedAt: number;
  deadlineAt: number | null;
};

export type PhaseDeadlineEvent = {
  sessionId: string;
  phaseId: string;
  phaseEpoch: number;
  phase: Phase;
  deadlineAt: number;
};

export type PhaseEngineOptions = {
  scenario: Scenario;
  registry: ParticipantRegistry;
  installationId: string;
  roomId: string;
  displayToken: string;
  policy?: Partial<PhaseEnginePolicy>;
  now?: () => number;
  sessionIdFactory?: () => string;
  onCheckpoint?: (checkpoint: PhaseCheckpoint) => void;
  onPhaseDeadline?: (event: PhaseDeadlineEvent) => void;
};

export type TransitionResult = { ok: true } | { ok: false; reason: "stale" | "invalid-target" | "wrong-phase" };

function isOpen(socket: WebSocket): boolean {
  return socket.readyState === undefined || socket.readyState === 0 || socket.readyState === 1;
}

export class PhaseEngine {
  private readonly scenario: Scenario;
  private readonly registry: ParticipantRegistry;
  private readonly installationId: string;
  private readonly roomId: string;
  private readonly displayToken: string;
  private readonly policy: PhaseEnginePolicy;
  private readonly now: () => number;
  private readonly sessionIdFactory: () => string;
  private readonly onCheckpoint: ((checkpoint: PhaseCheckpoint) => void) | undefined;
  private readonly onPhaseDeadline: ((event: PhaseDeadlineEvent) => void) | undefined;
  private readonly clients = new Set<WebSocket>();
  private readonly participantSockets = new Set<WebSocket>();

  private lifecycle: EngineLifecycle = "idle";
  private phaseId = "idle";
  private sessionId = "idle";
  private phaseEpoch = 0;
  private phaseStartedAt: number;
  private deadlineAt: number | null = null;
  private sessionStartedAt: number | null = null;
  private lastInputAt: number | null = null;
  private noParticipantSince: number | null = null;
  private displayDisconnectedAt: number | null = null;
  private deadlineNotified = false;
  private displaySocket: WebSocket | undefined;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: PhaseEngineOptions) {
    this.scenario = options.scenario;
    this.registry = options.registry;
    this.installationId = options.installationId;
    this.roomId = options.roomId;
    this.displayToken = options.displayToken;
    this.policy = { ...DEFAULT_PHASE_ENGINE_POLICY, ...options.policy };
    this.now = options.now ?? (() => Date.now());
    this.sessionIdFactory = options.sessionIdFactory ?? (() => `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.onCheckpoint = options.onCheckpoint;
    this.onPhaseDeadline = options.onPhaseDeadline;
    this.phaseStartedAt = this.now();
    this.requirePhase("idle");
  }

  get lifecycleState(): EngineLifecycle {
    return this.lifecycle;
  }

  get currentPhaseId(): string {
    return this.phaseId;
  }

  get currentSessionId(): string {
    return this.sessionId;
  }

  get currentPhaseEpoch(): number {
    return this.phaseEpoch;
  }

  get isDisplayConnected(): boolean {
    return this.displaySocket !== undefined;
  }

  get connectedParticipantCount(): number {
    return this.registry.connectedCount;
  }

  getSnapshot(now = this.now()): PhaseSnapshotMessage {
    const phase = this.currentPhase();
    return {
      ...phase,
      scenarioVersion: this.scenario.version,
      startedAt: this.phaseStartedAt,
      deadlineAt: this.deadlineAt,
    };
  }

  getSnapshotMessage(now = this.now()): Extract<ServerToClientMessage, { t: "snapshot" }> {
    return {
      t: "snapshot",
      v: 1,
      sessionId: this.sessionId,
      phaseEpoch: this.phaseEpoch,
      phase: this.getSnapshot(now),
      serverTime: now,
    };
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  tick(now = this.now()): void {
    if (this.lifecycle === "idle") return;

    if (this.displaySocket === undefined) {
      this.displayDisconnectedAt ??= now;
      if (now - this.displayDisconnectedAt >= this.policy.displayDisconnectTimeoutMs) {
        this.abortToIdle("display-timeout", now);
        return;
      }
    } else {
      this.displayDisconnectedAt = null;
    }

    if (this.registry.connectedCount === 0) {
      this.noParticipantSince ??= now;
      if (now - this.noParticipantSince >= this.policy.noParticipantGraceMs) {
        this.abortToIdle("no-participants", now);
        return;
      }
    } else {
      this.noParticipantSince = null;
    }

    if (this.lifecycle === "lobby") {
      if (this.deadlineAt !== null && now >= this.deadlineAt) {
        if (this.displaySocket !== undefined && this.registry.connectedCount > 0) {
          this.startSession(now);
        } else {
          this.abortToIdle("lobby-precondition-lost", now);
        }
      }
      return;
    }

    if (this.sessionStartedAt !== null && now - this.sessionStartedAt >= this.policy.maxSessionDurationMs) {
      this.abortToIdle("max-session-duration", now);
      return;
    }

    const phase = this.currentPhase();
    if (
      phase.kind === "position-question" &&
      this.lastInputAt !== null &&
      now - this.lastInputAt >= this.policy.interactiveIdleTimeoutMs
    ) {
      this.abortToIdle("interactive-idle-timeout", now);
      return;
    }

    if (this.deadlineAt !== null && now >= this.deadlineAt && !this.deadlineNotified) {
      this.deadlineNotified = true;
      this.onPhaseDeadline?.({
        sessionId: this.sessionId,
        phaseId: this.phaseId,
        phaseEpoch: this.phaseEpoch,
        phase,
        deadlineAt: this.deadlineAt,
      });
    }
  }

  participantJoined(socket: WebSocket, _participant?: ParticipantRecord): void {
    this.clients.add(socket);
    this.participantSockets.add(socket);
    this.send(socket, this.getSnapshotMessage());
    if (this.lifecycle === "idle" && this.displaySocket !== undefined && this.registry.connectedCount >= 1) {
      this.startLobby(this.now());
    }
  }

  socketClosed(socket: WebSocket): void {
    this.clients.delete(socket);
    this.participantSockets.delete(socket);
    if (this.displaySocket === socket) {
      this.displaySocket = undefined;
      this.displayDisconnectedAt = this.now();
    }
  }

  handleClientMessage(message: ClientToServerMessage, socket: WebSocket, _request?: IncomingMessage): void {
    switch (message.t) {
      case "display_join":
        if (
          message.installationId !== this.installationId ||
          message.roomId !== this.roomId ||
          message.displayToken !== this.displayToken
        ) {
          this.close(socket, 1008, "invalid display credentials");
          return;
        }
        this.connectDisplay(socket);
        return;
      case "display_heartbeat":
        if (socket === this.displaySocket && this.matches(message.sessionId, message.phaseId, message.phaseEpoch)) {
          this.displayDisconnectedAt = null;
        }
        return;
      case "video_ended":
        if (socket === this.displaySocket) {
          this.completeVideo(message.sessionId, message.phaseId, message.phaseEpoch);
        }
        return;
      case "input":
        if (
          this.participantSockets.has(socket) &&
          this.lifecycle === "active" &&
          this.currentPhase().kind === "position-question" &&
          this.matches(message.sessionId, this.phaseId, message.phaseEpoch)
        ) {
          this.recordInput(this.now());
        }
        return;
      default:
        return;
    }
  }

  recordInput(now = this.now()): boolean {
    if (this.lifecycle !== "active" || this.currentPhase().kind !== "position-question") return false;
    this.lastInputAt = now;
    return true;
  }

  setDisplayConnected(connected: boolean, now = this.now()): void {
    if (connected) {
      this.displayDisconnectedAt = null;
      return;
    }
    this.displayDisconnectedAt ??= now;
  }

  completeVideo(sessionId: string, phaseId: string, phaseEpoch: number, now = this.now()): TransitionResult {
    const phase = this.currentPhase();
    if (phase.kind !== "video") return { ok: false, reason: "wrong-phase" };
    if (!this.matches(sessionId, phaseId, phaseEpoch)) return { ok: false, reason: "stale" };
    return this.advanceTo(phase.next, now, "video-complete");
  }

  resolveQuestion(
    sessionId: string,
    phaseId: string,
    phaseEpoch: number,
    target: string,
    now = this.now(),
  ): TransitionResult {
    if (this.currentPhase().kind !== "position-question") return { ok: false, reason: "wrong-phase" };
    if (!this.matches(sessionId, phaseId, phaseEpoch)) return { ok: false, reason: "stale" };
    return this.advanceTo(target, now, "question-resolved");
  }

  recoverAfterCrash(now = this.now()): void {
    if (this.lifecycle === "idle") return;
    this.emitCheckpoint("recovery", "crash-recovery");
    this.abortToIdle("crash-recovery", now);
  }

  private connectDisplay(socket: WebSocket): void {
    if (this.displaySocket !== undefined && this.displaySocket !== socket) {
      this.send(this.displaySocket, {
        t: "display_notice",
        v: 1,
        code: "display_replaced",
        level: "warning",
        message: "This display connection was replaced.",
      });
      this.close(this.displaySocket, 4002, "display replaced");
    }
    this.displaySocket = socket;
    this.clients.add(socket);
    this.displayDisconnectedAt = null;
    this.send(socket, this.getSnapshotMessage());
    if (this.lifecycle === "idle" && this.registry.connectedCount >= 1) {
      this.startLobby(this.now());
    }
  }

  private startLobby(now: number): void {
    if (this.lifecycle !== "idle" || this.displaySocket === undefined || this.registry.connectedCount < 1) return;
    this.lifecycle = "lobby";
    this.sessionId = "lobby";
    this.phaseId = "idle";
    this.phaseStartedAt = now;
    this.deadlineAt = now + this.policy.lobbyCountdownMs;
    this.phaseEpoch += 1;
    this.sessionStartedAt = null;
    this.lastInputAt = now;
    this.noParticipantSince = null;
    this.deadlineNotified = false;
    this.transition("lobby-start");
  }

  private startSession(now: number): void {
    this.lifecycle = "active";
    this.sessionId = this.sessionIdFactory();
    this.sessionStartedAt = now;
    this.lastInputAt = now;
    this.noParticipantSince = null;
    this.enterPhase(this.scenario.entryPhaseId, now, "session-start");
  }

  private advanceTo(target: string, now: number, reason: string): TransitionResult {
    if (!this.scenario.phases.some((phase) => phase.id === target)) return { ok: false, reason: "invalid-target" };
    this.enterPhase(target, now, reason);
    return { ok: true };
  }

  private enterPhase(target: string, now: number, reason: string): void {
    const phase = this.requirePhase(target);
    this.phaseId = target;
    this.phaseStartedAt = now;
    this.deadlineAt = phase.kind === "video"
      ? now + phase.expectedDurationMs
      : phase.kind === "position-question"
        ? now + phase.durationMs
        : null;
    this.phaseEpoch += 1;
    this.deadlineNotified = false;
    if (phase.kind === "idle") {
      this.lifecycle = "idle";
      this.sessionId = "idle";
      this.sessionStartedAt = null;
      this.lastInputAt = null;
    } else {
      this.lifecycle = "active";
      this.lastInputAt ??= now;
    }
    this.transition(reason);
  }

  private abortToIdle(reason: string, now: number): void {
    this.enterPhase("idle", now, reason);
    this.noParticipantSince = null;
    this.displayDisconnectedAt = this.displaySocket === undefined ? now : null;
  }

  private transition(reason: string): void {
    this.emitCheckpoint("transition", reason);
    this.broadcast({
      t: "phase",
      v: 1,
      sessionId: this.sessionId,
      phaseEpoch: this.phaseEpoch,
      phase: this.getSnapshot(),
      serverTime: this.now(),
    });
  }

  private emitCheckpoint(kind: "transition" | "recovery", reason: string): void {
    this.onCheckpoint?.({
      kind,
      reason,
      sessionId: this.sessionId,
      phaseId: this.phaseId,
      phaseEpoch: this.phaseEpoch,
      startedAt: this.phaseStartedAt,
      deadlineAt: this.deadlineAt,
    });
  }

  private currentPhase(): Phase {
    return this.requirePhase(this.phaseId);
  }

  private requirePhase(id: string): Phase {
    const phase = this.scenario.phases.find((candidate) => candidate.id === id);
    if (!phase) throw new Error(`unknown phase "${id}"`);
    return phase;
  }

  private matches(sessionId: string, phaseId: string, phaseEpoch: number): boolean {
    return sessionId === this.sessionId && phaseId === this.phaseId && phaseEpoch === this.phaseEpoch;
  }

  private broadcast(message: ServerToClientMessage): void {
    for (const socket of this.clients) this.send(socket, message);
  }

  private send(socket: WebSocket, message: ServerToClientMessage): void {
    if (isOpen(socket)) socket.send(encodeMessage(message));
  }

  private close(socket: WebSocket, code: number, reason: string): void {
    if (isOpen(socket)) socket.close(code, reason);
  }
}
