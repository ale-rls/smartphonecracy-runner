import type { Cursor, CursorsMessage } from "@smartphonecracy/protocol";

/**
 * Cursor interpolation model (plan §9): the display renders cursor
 * positions ~100 ms behind live time and interpolates between the two
 * most recent server ticks to hide network jitter. Pure logic — the
 * canvas draws whatever renderAt() returns.
 */

export const RENDER_DELAY_MS = 100;
export const JOIN_HALO_MS = 1200;

type Sample = { x: number; y: number; at: number };

type TrackedCursor = {
  color: string;
  previous: Sample | null;
  latest: Sample;
  joinedAt: number;
};

export type RenderedCursor = {
  clientId: string;
  x: number;
  y: number;
  color: string;
  /** 0..1 halo progress for freshly joined cursors; null when done. */
  halo: number | null;
};

export class CursorField {
  private readonly cursors = new Map<string, TrackedCursor>();
  private frozen = false;
  private lastTick = -1;

  /** Ingest a server cursor batch. Ignored while frozen (plan §8 step 8). */
  ingest(message: CursorsMessage, receivedAt: number): void {
    if (this.frozen) return;
    if (message.tick <= this.lastTick) return; // stale/duplicate batch
    this.lastTick = message.tick;

    const seen = new Set<string>();
    for (const cursor of message.cursors) {
      seen.add(cursor.clientId);
      this.upsert(cursor, receivedAt);
    }
    // Cursors absent from a full batch have left the room.
    for (const clientId of this.cursors.keys()) {
      if (!seen.has(clientId)) this.cursors.delete(clientId);
    }
  }

  private upsert(cursor: Cursor, at: number): void {
    const existing = this.cursors.get(cursor.clientId);
    const sample: Sample = { x: cursor.x, y: cursor.y, at };
    if (existing) {
      existing.previous = existing.latest;
      existing.latest = sample;
      existing.color = cursor.color;
    } else {
      this.cursors.set(cursor.clientId, {
        color: cursor.color,
        previous: null,
        latest: sample,
        joinedAt: at,
      });
    }
  }

  /** Freeze the field at the vote deadline; unfreeze on the next phase. */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  renderAt(now: number): RenderedCursor[] {
    const renderTime = now - RENDER_DELAY_MS;
    const out: RenderedCursor[] = [];
    for (const [clientId, tracked] of this.cursors) {
      let x = tracked.latest.x;
      let y = tracked.latest.y;
      const { previous, latest } = tracked;
      if (previous && latest.at > previous.at && renderTime < latest.at) {
        const t = Math.max(
          0,
          Math.min(1, (renderTime - previous.at) / (latest.at - previous.at)),
        );
        x = previous.x + (latest.x - previous.x) * t;
        y = previous.y + (latest.y - previous.y) * t;
      }
      const haloAge = now - tracked.joinedAt;
      out.push({
        clientId,
        x,
        y,
        color: tracked.color,
        halo: haloAge < JOIN_HALO_MS ? haloAge / JOIN_HALO_MS : null,
      });
    }
    return out;
  }

  clear(): void {
    this.cursors.clear();
    this.frozen = false;
    this.lastTick = -1;
  }

  get size(): number {
    return this.cursors.size;
  }
}
