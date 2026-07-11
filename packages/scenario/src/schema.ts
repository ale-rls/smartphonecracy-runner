import { z } from "zod";
import { QUADRANTS } from "@smartphonecracy/shared";

/**
 * Zod schemas for the scenario model (plan §5).
 * Structural validity lives here; graph-level checks live in validate.ts.
 */

export const quadrantSchema = z.enum(QUADRANTS);

export const positionVoteStatusSchema = z.enum([
  "valid",
  "never-moved",
  "stale",
  "disconnected",
]);

/** Statuses that can contribute to a quadrant count ("never-moved" has no coordinates). */
export const countablePositionVoteStatusSchema = z.enum([
  "valid",
  "stale",
  "disconnected",
]);

const phaseIdSchema = z.string().min(1, "phase id must be non-empty");

const axisSchema = z.object({
  minLabel: z.string().min(1, "axis label must be non-empty"),
  maxLabel: z.string().min(1, "axis label must be non-empty"),
});

export const positionQuestionNextSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fixed"),
    target: phaseIdSchema,
  }),
  z.object({
    type: z.literal("quadrant-plurality"),
    // z.record would accept partial maps; an explicit object requires all four quadrants.
    map: z.object({
      q1: phaseIdSchema,
      q2: phaseIdSchema,
      q3: phaseIdSchema,
      q4: phaseIdSchema,
    }),
    tie: phaseIdSchema,
    empty: phaseIdSchema,
    countedStatuses: z
      .array(countablePositionVoteStatusSchema)
      .nonempty("countedStatuses must include at least one status")
      .refine((s) => new Set(s).size === s.length, {
        message: "countedStatuses must not contain duplicates",
      }),
  }),
]);

export const idlePhaseSchema = z.object({
  kind: z.literal("idle"),
  id: z.literal("idle"),
});

export const videoPhaseSchema = z.object({
  kind: z.literal("video"),
  id: phaseIdSchema,
  src: z.string().min(1, "video src must be non-empty"),
  expectedDurationMs: z.number().int().positive(),
  next: phaseIdSchema,
  allowSkip: z.boolean().optional(),
});

export const positionQuestionPhaseSchema = z.object({
  kind: z.literal("position-question"),
  id: phaseIdSchema,
  text: z.string().min(1, "question text must be non-empty"),
  xAxis: axisSchema,
  yAxis: axisSchema,
  durationMs: z.number().int().positive(),
  freezeMs: z.number().int().nonnegative(),
  connectionStaleAfterMs: z.number().int().positive(),
  showLiveCounts: z.boolean(),
  next: positionQuestionNextSchema,
});

export const phaseSchema = z.discriminatedUnion("kind", [
  idlePhaseSchema,
  videoPhaseSchema,
  positionQuestionPhaseSchema,
]);

export const scenarioSchema = z.object({
  version: z.string().min(1, "scenario version must be non-empty"),
  /** Phase the lobby transitions into when a session starts (plan §6). */
  entryPhaseId: phaseIdSchema,
  /**
   * Cycles are rejected unless explicitly marked intentional (plan §5:
   * "Cycles may be allowed intentionally, but must be explicitly marked").
   */
  cyclesAllowed: z.boolean().default(false),
  phases: z.array(phaseSchema).nonempty("scenario must contain at least one phase"),
});

export const mediaManifestSchema = z.object({
  files: z.array(
    z.object({
      src: z.string().min(1, "media src must be non-empty"),
      bytes: z.number().int().positive(),
      hash: z.string().min(1, "media hash must be non-empty"),
    }),
  ),
});

export type Quadrant = z.infer<typeof quadrantSchema>;
export type PositionVoteStatus = z.infer<typeof positionVoteStatusSchema>;
export type CountablePositionVoteStatus = z.infer<
  typeof countablePositionVoteStatusSchema
>;
export type PositionQuestionNext = z.infer<typeof positionQuestionNextSchema>;
export type IdlePhase = z.infer<typeof idlePhaseSchema>;
export type VideoPhase = z.infer<typeof videoPhaseSchema>;
export type PositionQuestionPhase = z.infer<typeof positionQuestionPhaseSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type MediaManifest = z.infer<typeof mediaManifestSchema>;

/** Runtime snapshot of the active phase as sent over the wire (plan §5). */
export type PhaseSnapshot = Phase & {
  scenarioVersion: string;
  startedAt: number;
  deadlineAt: number | null;
};
