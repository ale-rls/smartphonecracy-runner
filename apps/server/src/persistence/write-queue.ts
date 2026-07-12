export type SqlStatement = { text: string; values?: readonly unknown[] };

export interface PersistenceExecutor {
  execute(statements: readonly SqlStatement[]): Promise<void>;
  query<T extends object>(statement: SqlStatement): Promise<readonly T[]>;
}

export type PersistenceQueueHealthEvent =
  | { status: "degraded"; bufferedWrites: number; consecutiveFailures: number; error: unknown }
  | { status: "recovered"; bufferedWrites: number; consecutiveFailures: number }
  | { status: "buffer-full"; bufferedWrites: number; droppedWrites: number };

export type WriteQueueOptions = {
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  maxBufferedWrites?: number;
  sustainedFailureThreshold?: number;
  sleep?: (ms: number) => Promise<void>;
  onHealthEvent?: (event: PersistenceQueueHealthEvent) => void;
};

/** Single-consumer durable-write queue. enqueue() never awaits database I/O. */
export class PersistenceWriteQueue {
  private pending: SqlStatement[][] = [];
  private draining: Promise<void> | null = null;
  private readonly retryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly maxBufferedWrites: number;
  private readonly sustainedFailureThreshold: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private consecutiveFailures = 0;
  private degraded = false;

  constructor(private readonly executor: PersistenceExecutor, options: WriteQueueOptions = {}) {
    this.retryDelayMs = options.retryDelayMs ?? 100;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 5_000;
    this.maxBufferedWrites = options.maxBufferedWrites ?? 10_000;
    this.sustainedFailureThreshold = options.sustainedFailureThreshold ?? 5;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onHealthEvent = options.onHealthEvent ?? (() => undefined);
  }

  private readonly onHealthEvent: (event: PersistenceQueueHealthEvent) => void;

  get bufferedWrites(): number { return this.pending.length; }

  enqueue(statements: readonly SqlStatement[]): void {
    if (statements.length === 0) return;
    if (this.pending.length >= this.maxBufferedWrites) {
      this.emitHealth({ status: "buffer-full", bufferedWrites: this.pending.length, droppedWrites: 1 });
      return;
    }
    this.pending.push([...statements]);
    this.kick();
  }

  async flush(): Promise<void> {
    this.kick();
    await this.draining;
    if (this.pending.length > 0) throw new Error(`persistence flush incomplete: ${this.pending.length} write(s) buffered`);
  }

  query<T extends object>(statement: SqlStatement): Promise<readonly T[]> {
    return this.executor.query<T>(statement);
  }

  private kick(): void {
    if (this.draining !== null || this.pending.length === 0) return;
    this.draining = this.drain().catch((error: unknown) => {
      // Defensive boundary: neither a custom sleep nor a health observer may
      // create an unobserved rejection in the background consumer.
      this.emitHealth({ status: "degraded", bufferedWrites: this.pending.length, consecutiveFailures: this.consecutiveFailures, error });
    }).finally(() => {
      this.draining = null;
      if (this.pending.length > 0) this.kick();
    });
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.pending[0]!;
      try {
        await this.executor.execute(batch);
        const failures = this.consecutiveFailures;
        this.consecutiveFailures = 0;
        if (this.degraded) {
          this.degraded = false;
          this.emitHealth({ status: "recovered", bufferedWrites: this.pending.length - 1, consecutiveFailures: failures });
        }
        this.pending.shift();
      } catch (error) {
        this.consecutiveFailures += 1;
        if (!this.degraded && this.consecutiveFailures >= this.sustainedFailureThreshold) {
          this.degraded = true;
          this.emitHealth({ status: "degraded", bufferedWrites: this.pending.length, consecutiveFailures: this.consecutiveFailures, error });
        }
        const exponent = Math.min(this.consecutiveFailures - 1, 30);
        await this.sleep(Math.min(this.maxRetryDelayMs, this.retryDelayMs * 2 ** exponent));
      }
    }
  }

  private emitHealth(event: PersistenceQueueHealthEvent): void {
    try { this.onHealthEvent(event); } catch { /* health reporting must not stop persistence */ }
  }
}
