/**
 * Exponential reconnect backoff with jitter (plan §9: "Reconnect with
 * exponential backoff"). Deterministic when a rng is injected (tests).
 */

export type BackoffOptions = {
  baseMs?: number;
  factor?: number;
  capMs?: number;
  /** 0..1 fraction of the delay applied as random jitter. */
  jitter?: number;
  rng?: () => number;
};

export class Backoff {
  private attempt = 0;
  private readonly baseMs: number;
  private readonly factor: number;
  private readonly capMs: number;
  private readonly jitter: number;
  private readonly rng: () => number;

  constructor(options: BackoffOptions = {}) {
    this.baseMs = options.baseMs ?? 500;
    this.factor = options.factor ?? 2;
    this.capMs = options.capMs ?? 15_000;
    this.jitter = options.jitter ?? 0.2;
    this.rng = options.rng ?? Math.random;
  }

  /** Delay for the next attempt, advancing the attempt counter. */
  next(): number {
    const raw = Math.min(this.capMs, this.baseMs * this.factor ** this.attempt);
    this.attempt += 1;
    const jitterSpan = raw * this.jitter;
    return Math.round(raw - jitterSpan / 2 + jitterSpan * this.rng());
  }

  /** Call on a successful (re)connect so the next outage starts small. */
  reset(): void {
    this.attempt = 0;
  }
}
