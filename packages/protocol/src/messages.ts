import { z } from "zod";
import { phaseSchema, quadrantSchema } from "@smartphonecracy/scenario";

/**
 * WebSocket protocol (plan §7). All messages are JSON with a discriminator
 * field `t` and a protocol version `v`.
 */

export const PROTOCOL_VERSION = 1;

const v = z.literal(PROTOCOL_VERSION);
const nonEmpty = z.string().min(1);
/** Epoch-milliseconds timestamp as exchanged on the wire. */
const timestamp = z.number().finite();

/**
 * Wire form of PhaseSnapshot (plan §5): the phase plus timing metadata.
 * Kept structural (intersection) so it stays in lockstep with the
 * scenario package's Phase union.
 */
export const phaseSnapshotSchema = z.intersection(
  phaseSchema,
  z.object({
    scenarioVersion: nonEmpty,
    startedAt: timestamp,
    deadlineAt: timestamp.nullable(),
  }),
);

/** One cursor in a display batch. Shape is ours to define (plan leaves it open). */
export const cursorSchema = z.object({
  clientId: nonEmpty,
  x: z.number().finite(),
  y: z.number().finite(),
  color: nonEmpty,
});

export const quadrantCountsSchema = z.object({
  q1: z.number().int().nonnegative(),
  q2: z.number().int().nonnegative(),
  q3: z.number().int().nonnegative(),
  q4: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------- phone → server

export const joinSchema = z.object({
  t: z.literal("join"),
  v,
  clientVersion: nonEmpty,
  installationId: nonEmpty,
  roomId: nonEmpty,
  joinGrant: nonEmpty,
  participantLease: nonEmpty.optional(),
});

export const inputSchema = z.object({
  t: z.literal("input"),
  v,
  sessionId: nonEmpty,
  phaseEpoch: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  // Normalized 0..1; out-of-range finite values are accepted here and
  // clamped by the server (plan §7), so a slightly-off client is not
  // disconnected for rounding errors.
  x: z.number().finite(),
  y: z.number().finite(),
});

export const pingSchema = z.object({
  t: z.literal("ping"),
  v,
  clientTime: timestamp,
});

export const phoneToServerSchema = z.discriminatedUnion("t", [
  joinSchema,
  inputSchema,
  pingSchema,
]);

// -------------------------------------------------------------- display → server

export const displayJoinSchema = z.object({
  t: z.literal("display_join"),
  v,
  clientVersion: nonEmpty,
  installationId: nonEmpty,
  roomId: nonEmpty,
  displayToken: nonEmpty,
});

export const videoEndedSchema = z.object({
  t: z.literal("video_ended"),
  v,
  sessionId: nonEmpty,
  phaseId: nonEmpty,
  phaseEpoch: z.number().int().nonnegative(),
  mediaId: nonEmpty,
});

export const displayHeartbeatSchema = z.object({
  t: z.literal("display_heartbeat"),
  v,
  sessionId: nonEmpty,
  phaseId: nonEmpty,
  phaseEpoch: z.number().int().nonnegative(),
  clientTime: timestamp,
});

export const qrGrantRequestSchema = z.object({
  t: z.literal("qr_grant_request"),
  v,
});

export const displayToServerSchema = z.discriminatedUnion("t", [
  displayJoinSchema,
  videoEndedSchema,
  displayHeartbeatSchema,
  qrGrantRequestSchema,
]);

/** Everything the server can receive over a socket. */
export const clientToServerSchema = z.discriminatedUnion("t", [
  joinSchema,
  inputSchema,
  pingSchema,
  displayJoinSchema,
  videoEndedSchema,
  displayHeartbeatSchema,
  qrGrantRequestSchema,
]);

// ------------------------------------------------------------ server → all clients

export const snapshotSchema = z.object({
  t: z.literal("snapshot"),
  v,
  sessionId: nonEmpty,
  phaseEpoch: z.number().int().nonnegative(),
  phase: phaseSnapshotSchema,
  serverTime: timestamp,
});

export const phaseMessageSchema = z.object({
  t: z.literal("phase"),
  v,
  sessionId: nonEmpty,
  phaseEpoch: z.number().int().nonnegative(),
  phase: phaseSnapshotSchema,
  serverTime: timestamp,
});

export const presenceSchema = z.object({
  t: z.literal("presence"),
  v,
  count: z.number().int().nonnegative(),
});

/**
 * Version-mismatch reload instruction (plan §7). This envelope must stay
 * backward-compatible across supported deployments: extend it only with
 * optional fields.
 */
export const reloadSchema = z.object({
  t: z.literal("reload"),
  v,
  minVersion: nonEmpty,
  reason: z.enum(["protocol", "scenario", "assets"]),
});

// --------------------------------------------------------------- server → display

export const cursorsSchema = z.object({
  t: z.literal("cursors"),
  v,
  tick: z.number().int().nonnegative(),
  cursors: z.array(cursorSchema),
});

export const questionStatusSchema = z.object({
  t: z.literal("question_status"),
  v,
  sessionId: nonEmpty,
  phaseEpoch: z.number().int().nonnegative(),
  connectedCount: z.number().int().nonnegative(),
  positionedCount: z.number().int().nonnegative(),
  // Present only when the question's showLiveCounts is true (plan §7);
  // when hidden, the server omits the field entirely.
  quadrantCounts: quadrantCountsSchema.optional(),
});

export const questionResolvedSchema = z.object({
  t: z.literal("question_resolved"),
  v,
  sessionId: nonEmpty,
  phaseEpoch: z.number().int().nonnegative(),
  quadrantCounts: quadrantCountsSchema,
  // "fixed" = the question had a fixed transition: counts are still real
  // evidence, but no quadrant outcome should be dramatized by the display.
  winner: z.union([
    quadrantSchema,
    z.literal("tie"),
    z.literal("empty"),
    z.literal("fixed"),
  ]),
  resolvedTarget: nonEmpty,
  freezeUntil: timestamp,
});

export const qrGrantSchema = z.object({
  t: z.literal("qr_grant"),
  v,
  url: nonEmpty,
  expiresAt: timestamp,
  placement: z.enum(["large", "corner"]),
});

export const qrHiddenSchema = z.object({
  t: z.literal("qr_hidden"),
  v,
});

export const displayNoticeSchema = z.object({
  t: z.literal("display_notice"),
  v,
  code: z.enum(["display_replaced", "media_not_ready", "reconnecting"]),
  level: z.enum(["info", "warning", "error"]),
  message: z.string(),
});

// ----------------------------------------------------------------- server → phone

export const identitySchema = z.object({
  t: z.literal("identity"),
  v,
  clientId: nonEmpty,
  color: nonEmpty,
  sessionId: nonEmpty,
  participantLease: nonEmpty,
  leaseExpiresAt: timestamp,
});

export const joinRejectedSchema = z.object({
  t: z.literal("join_rejected"),
  v,
  reason: z.enum(["expired_grant", "room_full", "rate_limited", "show_in_progress"]),
  retryAfterMs: z.number().int().positive().optional(),
});

export const statusSchema = z.object({
  t: z.literal("status"),
  v,
  phaseId: nonEmpty,
  message: z.string(),
});

export const pongSchema = z.object({
  t: z.literal("pong"),
  v,
  echoClientTime: timestamp,
  serverTime: timestamp,
});

/** Everything a client can receive from the server. */
export const serverToClientSchema = z.discriminatedUnion("t", [
  snapshotSchema,
  phaseMessageSchema,
  presenceSchema,
  reloadSchema,
  cursorsSchema,
  questionStatusSchema,
  questionResolvedSchema,
  qrGrantSchema,
  qrHiddenSchema,
  displayNoticeSchema,
  identitySchema,
  joinRejectedSchema,
  statusSchema,
  pongSchema,
]);

// ------------------------------------------------------------------------- types

export type PhaseSnapshotMessage = z.infer<typeof phaseSnapshotSchema>;
export type Cursor = z.infer<typeof cursorSchema>;
export type QuadrantCounts = z.infer<typeof quadrantCountsSchema>;

export type JoinMessage = z.infer<typeof joinSchema>;
export type InputMessage = z.infer<typeof inputSchema>;
export type PingMessage = z.infer<typeof pingSchema>;
export type PhoneToServerMessage = z.infer<typeof phoneToServerSchema>;

export type DisplayJoinMessage = z.infer<typeof displayJoinSchema>;
export type VideoEndedMessage = z.infer<typeof videoEndedSchema>;
export type DisplayHeartbeatMessage = z.infer<typeof displayHeartbeatSchema>;
export type QrGrantRequestMessage = z.infer<typeof qrGrantRequestSchema>;
export type DisplayToServerMessage = z.infer<typeof displayToServerSchema>;

export type ClientToServerMessage = z.infer<typeof clientToServerSchema>;

export type SnapshotMessage = z.infer<typeof snapshotSchema>;
export type PhaseMessage = z.infer<typeof phaseMessageSchema>;
export type PresenceMessage = z.infer<typeof presenceSchema>;
export type ReloadMessage = z.infer<typeof reloadSchema>;
export type CursorsMessage = z.infer<typeof cursorsSchema>;
export type QuestionStatusMessage = z.infer<typeof questionStatusSchema>;
export type QuestionResolvedMessage = z.infer<typeof questionResolvedSchema>;
export type QrGrantMessage = z.infer<typeof qrGrantSchema>;
export type QrHiddenMessage = z.infer<typeof qrHiddenSchema>;
export type DisplayNoticeMessage = z.infer<typeof displayNoticeSchema>;
export type IdentityMessage = z.infer<typeof identitySchema>;
export type JoinRejectedMessage = z.infer<typeof joinRejectedSchema>;
export type StatusMessage = z.infer<typeof statusSchema>;
export type PongMessage = z.infer<typeof pongSchema>;
export type ServerToClientMessage = z.infer<typeof serverToClientSchema>;
