export const VIDEO_FALLBACK_GRACE_MS = 5_000;

export type VideoPhaseIdentity = {
  sessionId: string;
  phaseId: string;
  phaseEpoch: number;
};

type ActiveVideo = VideoPhaseIdentity & { fallbackAt: number };

function matches(active: ActiveVideo, identity: VideoPhaseIdentity): boolean {
  return active.sessionId === identity.sessionId &&
    active.phaseId === identity.phaseId &&
    active.phaseEpoch === identity.phaseEpoch;
}

/** Owns the one-shot completion gate for the current video phase. */
export class VideoPhaseHandler {
  private active: ActiveVideo | null = null;

  begin(identity: VideoPhaseIdentity, expectedDurationMs: number, now: number): number {
    const fallbackAt = now + expectedDurationMs + VIDEO_FALLBACK_GRACE_MS;
    this.active = { ...identity, fallbackAt };
    return fallbackAt;
  }

  cancel(): void {
    this.active = null;
  }

  complete(identity: VideoPhaseIdentity): boolean {
    if (this.active === null || !matches(this.active, identity)) return false;
    this.active = null;
    return true;
  }

  consumeFallback(now: number): VideoPhaseIdentity | null {
    if (this.active === null || now < this.active.fallbackAt) return null;
    const { sessionId, phaseId, phaseEpoch } = this.active;
    this.active = null;
    return { sessionId, phaseId, phaseEpoch };
  }
}
