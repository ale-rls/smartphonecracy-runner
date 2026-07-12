import { createHash, randomBytes } from "node:crypto";
import type { WebSocket } from "ws";

export const IDENTITY_COLORS = [
  "#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93",
  "#f15bb5", "#00bbf9", "#00f5d4", "#fb8500", "#8338ec",
  "#3a86ff", "#06d6a0",
] as const;

export type ParticipantRecord = {
  clientId: string;
  participantLease: string;
  color: string;
  leaseExpiresAt: number;
  socket?: WebSocket | undefined;
  lastSeenAt: number;
};

export type RegistryAdmission =
  | { ok: true; participant: ParticipantRecord; replacedSocket?: WebSocket | undefined }
  | { ok: false; reason: "room_full" };

function socketIsConnected(socket: WebSocket | undefined): boolean {
  if (!socket) return false;
  // The fallback keeps lightweight unit-test doubles useful while real ws
  // sockets expose OPEN/CONNECTING numeric ready states.
  return socket.readyState === undefined || socket.readyState === 0 || socket.readyState === 1;
}

function newClientId(): string {
  return `client-${randomBytes(9).toString("base64url")}`;
}

function colorStart(clientId: string): number {
  const digest = createHash("sha256").update(clientId).digest();
  return digest[0]! % IDENTITY_COLORS.length;
}

export class ParticipantRegistry {
  private readonly participants = new Map<string, ParticipantRecord>();

  constructor(private readonly maxParticipants: number) {
    if (maxParticipants < 1) throw new Error("maxParticipants must be positive");
  }

  get leaseCount(): number {
    return this.participants.size;
  }

  get connectedCount(): number {
    let count = 0;
    for (const participant of this.participants.values()) {
      if (socketIsConnected(participant.socket)) count += 1;
    }
    return count;
  }

  hasLease(participantLease: string): boolean {
    return this.participants.has(participantLease);
  }

  get(participantLease: string): ParticipantRecord | undefined {
    return this.participants.get(participantLease);
  }

  canAdmitNew(): boolean {
    return this.connectedCount < this.maxParticipants;
  }

  admit(options: {
    participantLease: string;
    clientId: string;
    leaseExpiresAt: number;
    socket: WebSocket;
    now?: number;
  }): RegistryAdmission {
    const now = options.now ?? Date.now();
    const existing = this.participants.get(options.participantLease);
    if (!existing && !this.canAdmitNew()) return { ok: false, reason: "room_full" };

    const participant = existing ?? {
      clientId: options.clientId,
      participantLease: options.participantLease,
      color: this.allocateColor(options.clientId),
      leaseExpiresAt: options.leaseExpiresAt,
      lastSeenAt: now,
    };
    const replacedSocket = existing?.socket && existing.socket !== options.socket
      ? existing.socket
      : undefined;
    participant.socket = options.socket;
    participant.lastSeenAt = now;
    participant.leaseExpiresAt = options.leaseExpiresAt;
    this.participants.set(options.participantLease, participant);
    return replacedSocket === undefined
      ? { ok: true, participant }
      : { ok: true, participant, replacedSocket };
  }

  releaseSocket(socket: WebSocket): void {
    for (const participant of this.participants.values()) {
      if (participant.socket === socket) participant.socket = undefined;
    }
  }

  pruneExpired(now = Date.now()): void {
    for (const [lease, participant] of this.participants) {
      if (participant.leaseExpiresAt <= now) {
        participant.socket?.terminate();
        this.participants.delete(lease);
      }
    }
  }

  private allocateColor(clientId: string): string {
    const used = new Set([...this.participants.values()].map((participant) => participant.color));
    const start = colorStart(clientId);
    for (let offset = 0; offset < IDENTITY_COLORS.length; offset += 1) {
      const color = IDENTITY_COLORS[(start + offset) % IDENTITY_COLORS.length]!;
      if (!used.has(color)) return color;
    }
    return IDENTITY_COLORS[start]!;
  }
}

export function createClientId(): string {
  return newClientId();
}
