import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { parseServerMessage } from "@smartphonecracy/protocol";
import { AdmissionController, InMemoryIpRateLimiter, issueJoinGrant, issueParticipantLease, verifyJoinGrant, verifyParticipantLease } from "./index.js";
import type { WebSocket } from "ws";

class MockSocket extends EventEmitter {
  readyState = 1;
  readonly sent: unknown[] = [];
  readonly closeCalls: Array<{ code: number | undefined; reason: string | undefined }> = [];

  send(value: string): void {
    this.sent.push(JSON.parse(value));
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
    this.emit("close");
  }

  terminate(): void {
    this.close(1006, "terminated");
  }
}

function socket(): WebSocket {
  return new MockSocket() as unknown as WebSocket;
}

function request(ip = "192.0.2.1"): IncomingMessage {
  return {
    headers: {},
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

function lastMessage(s: WebSocket): any {
  return (s as unknown as MockSocket).sent.at(-1);
}

function join(controller: AdmissionController, s: WebSocket, grant: string, lease?: string, ip?: string): void {
  controller.handleConnection(s, request(ip));
  s.emit("message", Buffer.from(JSON.stringify({
    t: "join",
    v: 1,
    clientVersion: "test",
    installationId: "inst-1",
    roomId: "room-1",
    joinGrant: grant,
    ...(lease ? { participantLease: lease } : {}),
  })));
}

function controller(options: Partial<ConstructorParameters<typeof AdmissionController>[0]> = {}): AdmissionController {
  return new AdmissionController({
    installationId: "inst-1",
    roomId: "room-1",
    secret: "this-is-a-test-secret",
    now: () => 1_000,
    policy: { maxParticipants: 30, joinGrantTtlMs: 120_000, participantLeaseTtlMs: 7_200_000 },
    ...options,
  });
}

describe("HMAC admission tokens", () => {
  it("rotates grants with unique nonces and rejects expiry, tampering, and wrong scope", () => {
    const first = issueJoinGrant({ secret: "secret", installationId: "i", roomId: "r", ttlMs: 120, now: 1_000 });
    const second = issueJoinGrant({ secret: "secret", installationId: "i", roomId: "r", ttlMs: 120, now: 1_001 });
    expect(first.token).not.toBe(second.token);
    expect(verifyJoinGrant(first.token, { secret: "secret", installationId: "i", roomId: "r", now: 1_119 })).not.toBeNull();
    expect(verifyJoinGrant(first.token, { secret: "secret", installationId: "i", roomId: "r", now: 1_120 })).toBeNull();
    expect(verifyJoinGrant(`${first.token}x`, { secret: "secret", installationId: "i", roomId: "r", now: 1_001 })).toBeNull();
    expect(verifyJoinGrant(first.token, { secret: "secret", installationId: "other", roomId: "r", now: 1_001 })).toBeNull();
  });

  it("issues installation-scoped two-hour participant leases", () => {
    const lease = issueParticipantLease({ secret: "secret", installationId: "i", clientId: "c1", ttlMs: 7_200_000, now: 1_000 });
    expect(verifyParticipantLease(lease.token, { secret: "secret", installationId: "i", now: 7_201_000 })).toBeNull();
    expect(verifyParticipantLease(lease.token, { secret: "secret", installationId: "i", now: 7_200_999 })?.clientId).toBe("c1");
    expect(verifyParticipantLease(lease.token, { secret: "secret", installationId: "other", now: 1_001 })).toBeNull();
    expect(verifyParticipantLease(lease.token, { secret: "secret", installationId: "i", now: 1_001 })?.clientId).toBe("c1");
  });
});

describe("participant admission", () => {
  it("assigns stable identity and replaces a same-lease socket at capacity", () => {
    const admission = controller({
      policy: { maxParticipants: 2, joinGrantTtlMs: 120_000, participantLeaseTtlMs: 7_200_000 },
    });
    const grant = admission.issueJoinGrant(1_000).token;
    const first = socket();
    const second = socket();
    join(admission, first, grant, undefined, "198.51.100.1");
    join(admission, second, grant, undefined, "198.51.100.2");
    const firstIdentity = lastMessage(first);
    expect(firstIdentity).toMatchObject({ t: "identity", sessionId: "idle", clientId: expect.any(String), color: expect.any(String) });
    expect(admission.registry.connectedCount).toBe(2);

    const rejected = socket();
    join(admission, rejected, grant, undefined, "198.51.100.3");
    expect(lastMessage(rejected)).toMatchObject({ t: "join_rejected", reason: "room_full" });

    const replacement = socket();
    join(admission, replacement, grant, (firstIdentity as { participantLease: string }).participantLease, "198.51.100.4");
    expect(lastMessage(replacement)).toMatchObject({ t: "identity", clientId: (firstIdentity as { clientId: string }).clientId });
    expect((first as unknown as MockSocket).closeCalls).toContainEqual({ code: 4001, reason: "lease replaced" });
    expect(admission.registry.connectedCount).toBe(2);
  });

  it("rate-limits join attempts per IP without using IP as identity", () => {
    const admission = controller({ rateLimiter: new InMemoryIpRateLimiter({ maxAttempts: 2, windowMs: 1_000 }) });
    const invalid = "grant.v1.invalid.invalid";
    for (let i = 0; i < 2; i += 1) {
      const s = socket();
      join(admission, s, invalid, undefined, "203.0.113.8");
      expect(lastMessage(s)).toMatchObject({ t: "join_rejected", reason: "expired_grant" });
    }
    const limited = socket();
    join(admission, limited, invalid, undefined, "203.0.113.8");
    expect(lastMessage(limited)).toMatchObject({ t: "join_rejected", reason: "rate_limited", retryAfterMs: 1_000 });
    expect(admission.rateLimiter.size).toBe(1);
  });

  it("parses every socket payload and closes malformed data", () => {
    const admission = controller();
    const s = socket();
    admission.handleConnection(s, request());
    s.emit("message", Buffer.from("{not-json"));
    expect((s as unknown as MockSocket).closeCalls[0]).toMatchObject({ code: 1008 });
    expect(parseServerMessage(JSON.stringify(lastMessage(s))).ok).toBe(false);
  });
});
