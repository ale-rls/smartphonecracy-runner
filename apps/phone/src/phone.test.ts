import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type ServerToClientMessage } from "@smartphonecracy/protocol";
import { clearLease, loadLease, storeLease } from "./lib/lease.js";
import { applyDelta, InputThrottle, TRACKPAD_CENTER } from "./lib/trackpad.js";
import {
  initialPhoneState,
  phoneReducer,
  type PhoneState,
} from "./state/store.js";

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe("lease storage", () => {
  it("is installation-scoped", () => {
    const storage = memoryStorage();
    storeLease("inst-a", "lease-a", storage);
    storeLease("inst-b", "lease-b", storage);
    expect(loadLease("inst-a", storage)).toBe("lease-a");
    expect(loadLease("inst-b", storage)).toBe("lease-b");
    clearLease("inst-a", storage);
    expect(loadLease("inst-a", storage)).toBeNull();
    expect(loadLease("inst-b", storage)).toBe("lease-b");
  });

  it("survives a throwing storage (private mode)", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadLease("inst-a", throwing)).toBeNull();
    expect(() => storeLease("inst-a", "x", throwing)).not.toThrow();
  });
});

describe("trackpad", () => {
  it("moves relative to surface size with sensitivity", () => {
    const next = applyDelta(TRACKPAD_CENTER, 100, -50, 1000, 1.4);
    expect(next.x).toBeCloseTo(0.5 + 0.1 * 1.4);
    expect(next.y).toBeCloseTo(0.5 - 0.05 * 1.4);
  });

  it("clamps at the edges", () => {
    const next = applyDelta({ x: 0.95, y: 0.02 }, 500, -500, 1000);
    expect(next.x).toBe(1);
    expect(next.y).toBe(0);
  });

  it("ignores a zero-sized surface", () => {
    expect(applyDelta(TRACKPAD_CENTER, 10, 10, 0)).toEqual(TRACKPAD_CENTER);
  });

  it("throttles to ~25 Hz, latest-wins", () => {
    const throttle = new InputThrottle(40);
    expect(throttle.shouldSend(0)).toBe(true);
    expect(throttle.shouldSend(20)).toBe(false);
    expect(throttle.shouldSend(39)).toBe(false);
    expect(throttle.shouldSend(40)).toBe(true);
  });
});

const apply = (state: PhoneState, message: ServerToClientMessage) =>
  phoneReducer(state, { type: "server-message", message });

const phase = (
  kind: "video" | "position-question",
  epoch: number,
  sessionId = "s1",
): ServerToClientMessage => ({
  t: "phase",
  v: PROTOCOL_VERSION,
  sessionId,
  phaseEpoch: epoch,
  serverTime: 0,
  phase:
    kind === "video"
      ? {
          kind: "video",
          id: "v",
          src: "v.mp4",
          expectedDurationMs: 1000,
          next: "q",
          scenarioVersion: "dev",
          startedAt: 0,
          deadlineAt: null,
        }
      : {
          kind: "position-question",
          id: "q",
          text: "t",
          field: { type: "four-quadrant", xAxis: { minLabel: "a", maxLabel: "b" }, yAxis: { minLabel: "c", maxLabel: "d" } },
          durationMs: 60_000,
          freezeMs: 3_000,
          connectionStaleAfterMs: 30_000,
          showLiveCounts: false,
          next: { type: "fixed", target: "idle" },
          scenarioVersion: "dev",
          startedAt: 0,
          deadlineAt: 60_000,
        },
});

describe("phoneReducer", () => {
  it("opens cursor input during videos and position questions", () => {
    let s = apply(initialPhoneState, phase("video", 1));
    expect(s.inputOpen).toBe(true);
    s = apply(s, phase("position-question", 2));
    expect(s.inputOpen).toBe(true);
    s = apply(s, phase("video", 3));
    expect(s.inputOpen).toBe(true);
  });

  it("guards against stale epochs within a session", () => {
    let s = apply(initialPhoneState, phase("position-question", 5));
    s = apply(s, phase("video", 3));
    expect(s.inputOpen).toBe(true); // stale video frame ignored
  });

  it("accepts a new session with a reset epoch", () => {
    let s = apply(initialPhoneState, phase("video", 9, "s1"));
    s = apply(s, phase("position-question", 0, "s2"));
    expect(s.sessionId).toBe("s2");
    expect(s.inputOpen).toBe(true);
  });

  it("tracks join lifecycle including rejection detail", () => {
    let s = phoneReducer(initialPhoneState, { type: "socket-open" });
    expect(s.join.kind).toBe("joining");
    s = apply(s, {
      t: "identity",
      v: PROTOCOL_VERSION,
      clientId: "c1",
      color: "#fff",
      sessionId: "s1",
      participantLease: "lease",
      leaseExpiresAt: 99,
    });
    expect(s.join.kind).toBe("accepted");
    s = apply(s, { t: "join_rejected", v: PROTOCOL_VERSION, reason: "rate_limited", retryAfterMs: 2000 });
    expect(s.join).toEqual({ kind: "rejected", reason: "rate_limited", retryAfterMs: 2000 });
  });

  it("closes input when the socket drops", () => {
    let s = apply(initialPhoneState, phase("position-question", 1));
    s = phoneReducer(s, { type: "socket-lost" });
    expect(s.inputOpen).toBe(false);
    expect(s.join.kind).toBe("connecting");
  });
});
