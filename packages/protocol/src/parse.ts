import type { z } from "zod";
import {
  clientToServerSchema,
  serverToClientSchema,
  type ClientToServerMessage,
  type ServerToClientMessage,
} from "./messages.js";

/**
 * Parsing helpers for raw socket data. Invalid input never throws: the
 * server must survive any bytes a client sends (plan §7), so failures
 * come back as values with a human-readable reason for logging.
 */

export type ParseResult<T> =
  | { ok: true; message: T }
  | { ok: false; error: "invalid-json" | "invalid-message"; reason: string };

function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
): ParseResult<z.infer<S>> {
  let value: unknown = raw;
  if (typeof raw === "string" || raw instanceof Uint8Array) {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, error: "invalid-json", reason: "payload is not valid JSON" };
    }
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first && first.path.length > 0 ? ` at ${first.path.join(".")}` : "";
    return {
      ok: false,
      error: "invalid-message",
      reason: `${first?.message ?? "unknown validation error"}${path}`,
    };
  }
  return { ok: true, message: result.data };
}

/** Parse anything arriving at the server from a phone or display socket. */
export function parseClientMessage(raw: unknown): ParseResult<ClientToServerMessage> {
  return parseWith(clientToServerSchema, raw);
}

/** Parse anything arriving at a client from the server. */
export function parseServerMessage(raw: unknown): ParseResult<ServerToClientMessage> {
  return parseWith(serverToClientSchema, raw);
}

/** Serialize a message for the wire. */
export function encodeMessage(
  message: ClientToServerMessage | ServerToClientMessage,
): string {
  return JSON.stringify(message);
}

/** Clamp a normalized coordinate into 0..1 (server-side input hygiene, plan §7). */
export function clampNormalized(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
