import { PROTOCOL_VERSION, type Cursor, type CursorsMessage, type PresenceMessage } from "@smartphonecracy/protocol";

export const CURSOR_TICK_INTERVAL_MS = 40;

type CursorState = Cursor & { lastSeq: number };

export type CursorPipelineOptions = {
  sendCursors: (message: CursorsMessage) => void;
  sendPresence: (message: PresenceMessage) => void;
  intervalMs?: number;
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export class CursorPipeline {
  private readonly cursors = new Map<string, CursorState>();
  private readonly intervalMs: number;
  private tickNumber = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: CursorPipelineOptions) {
    this.intervalMs = options.intervalMs ?? CURSOR_TICK_INTERVAL_MS;
    if (this.intervalMs < 1) throw new Error("cursor interval must be positive");
  }

  join(clientId: string, color: string): void {
    const existing = this.cursors.get(clientId);
    if (existing) {
      existing.color = color;
      return;
    }
    this.cursors.set(clientId, { clientId, color, x: 0.5, y: 0.5, lastSeq: -1 });
    this.emitPresence();
  }

  leave(clientId: string): void {
    if (this.cursors.delete(clientId)) this.emitPresence();
  }

  recordInput(clientId: string, seq: number, x: number, y: number): boolean {
    const cursor = this.cursors.get(clientId);
    if (!cursor || !Number.isSafeInteger(seq) || seq < 0 || seq <= cursor.lastSeq) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    cursor.lastSeq = seq;
    cursor.x = clamp(x);
    cursor.y = clamp(y);
    return true;
  }

  tick(): void {
    this.options.sendCursors({
      t: "cursors",
      v: PROTOCOL_VERSION,
      tick: this.tickNumber,
      cursors: [...this.cursors.values()].map(({ lastSeq: _lastSeq, ...cursor }) => cursor),
    });
    this.tickNumber += 1;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private emitPresence(): void {
    this.options.sendPresence({ t: "presence", v: PROTOCOL_VERSION, count: this.cursors.size });
  }
}
