export type SqlStatement = { text: string; values?: readonly unknown[] };

export interface PersistenceExecutor {
  execute(statements: readonly SqlStatement[]): Promise<void>;
}

export type WriteQueueOptions = {
  maxRetries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/** Single-consumer durable-write queue. enqueue() never awaits database I/O. */
export class PersistenceWriteQueue {
  private pending: SqlStatement[][] = [];
  private draining: Promise<void> | null = null;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly executor: PersistenceExecutor, options: WriteQueueOptions = {}) {
    this.maxRetries = options.maxRetries ?? 5;
    this.retryDelayMs = options.retryDelayMs ?? 100;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get bufferedWrites(): number { return this.pending.length; }

  enqueue(statements: readonly SqlStatement[]): void {
    if (statements.length === 0) return;
    this.pending.push([...statements]);
    this.kick();
  }

  async flush(): Promise<void> {
    this.kick();
    await this.draining;
    if (this.pending.length > 0) throw new Error(`persistence flush incomplete: ${this.pending.length} write(s) buffered`);
  }

  private kick(): void {
    if (this.draining !== null || this.pending.length === 0) return;
    this.draining = this.drain().finally(() => {
      this.draining = null;
      if (this.pending.length > 0) this.kick();
    });
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.pending[0]!;
      let error: unknown;
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        try {
          await this.executor.execute(batch);
          error = undefined;
          break;
        } catch (caught) {
          error = caught;
          if (attempt < this.maxRetries) await this.sleep(this.retryDelayMs * 2 ** attempt);
        }
      }
      if (error !== undefined) throw error;
      this.pending.shift();
    }
  }
}
