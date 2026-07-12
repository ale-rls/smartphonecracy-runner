import type { IncomingMessage } from "node:http";
import { encodeMessage, parseClientMessage, type IdentityMessage, type JoinRejectedMessage } from "@smartphonecracy/protocol";
import { DEFAULT_INSTALLATION_POLICY } from "@smartphonecracy/shared";
import type { RawData, WebSocket } from "ws";
import {
  issueJoinGrant,
  issueParticipantLease,
  verifyJoinGrant,
  verifyParticipantLease,
  type JoinGrantClaims,
} from "./tokens.js";
import { InMemoryIpRateLimiter } from "./rate-limit.js";
import { createClientId, ParticipantRegistry } from "./registry.js";

export type AdmissionPolicy = {
  maxParticipants: number;
  joinGrantTtlMs: number;
  participantLeaseTtlMs: number;
};

export type AdmissionControllerOptions = {
  installationId: string;
  roomId: string;
  secret: string;
  policy?: AdmissionPolicy;
  sessionId?: string | (() => string);
  now?: () => number;
  rateLimiter?: InMemoryIpRateLimiter;
};

type SocketState = { joined: boolean };

function requestIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0]!.trim();
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0];
  return request.socket.remoteAddress ?? "unknown";
}

function asBytes(raw: RawData): unknown {
  if (Array.isArray(raw)) return Buffer.concat(raw);
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  return raw;
}

export class AdmissionController {
  readonly registry: ParticipantRegistry;
  readonly rateLimiter: InMemoryIpRateLimiter;
  private readonly now: () => number;
  private readonly options: AdmissionControllerOptions & { policy: AdmissionPolicy };
  private readonly socketStates = new WeakMap<WebSocket, SocketState>();

  constructor(options: AdmissionControllerOptions) {
    this.options = {
      ...options,
      policy: options.policy ?? DEFAULT_INSTALLATION_POLICY,
    };
    this.now = options.now ?? (() => Date.now());
    this.registry = new ParticipantRegistry(this.options.policy.maxParticipants);
    this.rateLimiter = options.rateLimiter ?? new InMemoryIpRateLimiter();
  }

  issueJoinGrant(now = this.now()): { token: string; claims: JoinGrantClaims } {
    return issueJoinGrant({
      secret: this.options.secret,
      installationId: this.options.installationId,
      roomId: this.options.roomId,
      ttlMs: this.options.policy.joinGrantTtlMs,
      now,
    });
  }

  handleConnection(socket: WebSocket, request: IncomingMessage): void {
    this.socketStates.set(socket, { joined: false });
    socket.on("message", (raw: RawData) => {
      void this.handleRaw(socket, request, asBytes(raw));
    });
    socket.on("close", () => this.registry.releaseSocket(socket));
    socket.on("error", () => this.registry.releaseSocket(socket));
  }

  private async handleRaw(socket: WebSocket, request: IncomingMessage, raw: unknown): Promise<void> {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.close(socket, 1008, "invalid client message");
      return;
    }
    if (parsed.message.t === "ping") {
      this.send(socket, {
        t: "pong",
        v: 1,
        echoClientTime: parsed.message.clientTime,
        serverTime: this.now(),
      });
      return;
    }
    if (parsed.message.t !== "join") return;

    const state = this.socketStates.get(socket);
    if (!state || state.joined) {
      this.close(socket, 1008, "socket already joined");
      return;
    }
    const rate = this.rateLimiter.consume(requestIp(request), this.now());
    if (!rate.allowed) {
      this.send(socket, {
        t: "join_rejected",
        v: 1,
        reason: "rate_limited",
        ...(rate.retryAfterMs === undefined ? {} : { retryAfterMs: rate.retryAfterMs }),
      });
      return;
    }

    const now = this.now();
    const grant = verifyJoinGrant(parsed.message.joinGrant, {
      secret: this.options.secret,
      installationId: this.options.installationId,
      roomId: this.options.roomId,
      now,
    });
    if (!grant) {
      this.send(socket, { t: "join_rejected", v: 1, reason: "expired_grant" });
      return;
    }

    this.registry.pruneExpired(now);
    const lease = parsed.message.participantLease
      ? verifyParticipantLease(parsed.message.participantLease, {
          secret: this.options.secret,
          installationId: this.options.installationId,
          now,
        })
      : null;
    const knownLease = parsed.message.participantLease && lease
      ? this.registry.get(parsed.message.participantLease)
      : undefined;
    if (!knownLease && !this.registry.canAdmitNew()) {
      this.send(socket, { t: "join_rejected", v: 1, reason: "room_full" });
      return;
    }

    const clientId = lease?.clientId ?? createClientId();
    const issuedLease = lease && parsed.message.participantLease
      ? { token: parsed.message.participantLease, claims: lease }
      : issueParticipantLease({
          secret: this.options.secret,
          installationId: this.options.installationId,
          clientId,
          ttlMs: this.options.policy.participantLeaseTtlMs,
          now,
        });
    const admitted = this.registry.admit({
      participantLease: issuedLease.token,
      clientId,
      leaseExpiresAt: issuedLease.claims.expiresAt,
      socket,
      now,
    });
    if (!admitted.ok) {
      this.send(socket, { t: "join_rejected", v: 1, reason: "room_full" });
      return;
    }
    if (admitted.replacedSocket) this.close(admitted.replacedSocket, 4001, "lease replaced");
    state.joined = true;
    this.send(socket, {
      t: "identity",
      v: 1,
      clientId: admitted.participant.clientId,
      color: admitted.participant.color,
      sessionId: typeof this.options.sessionId === "function" ? this.options.sessionId() : this.options.sessionId ?? "idle",
      participantLease: issuedLease.token,
      leaseExpiresAt: issuedLease.claims.expiresAt,
    });
    await Promise.resolve();
  }

  private send(socket: WebSocket, message: IdentityMessage | JoinRejectedMessage | { t: "pong"; v: 1; echoClientTime: number; serverTime: number }): void {
    if (socket.readyState === undefined || socket.readyState === 1) socket.send(encodeMessage(message));
  }

  private close(socket: WebSocket, code: number, reason: string): void {
    if (socket.readyState === undefined || socket.readyState === 0 || socket.readyState === 1) {
      socket.close(code, reason);
    }
  }
}
