/**
 * Scenario types, validation, and graph utilities (plan §5).
 */

export const SCENARIO_SCHEMA_VERSION = 2;

export {
  axisSchema,
  countablePositionVoteStatusSchema,
  fourQuadrantFieldSchema,
  fourQuadrantPluralityNextSchema,
  idlePhaseSchema,
  mediaManifestSchema,
  phaseSchema,
  positionQuestionNextSchema,
  positionQuestionPhaseSchema,
  positionFieldSchema,
  positionVoteStatusSchema,
  quadrantSchema,
  scenarioSchema,
  twoQuadrantFieldSchema,
  twoQuadrantPluralityNextSchema,
  twoQuadrantSchema,
  videoPhaseSchema,
  normalizePositionQuestionInput,
  normalizeScenarioInput,
} from "./schema.js";
export type {
  Axis,
  CountablePositionVoteStatus,
  FourQuadrantField,
  FourQuadrantPluralityNext,
  IdlePhase,
  MediaManifest,
  Phase,
  PhaseSnapshot,
  PositionQuestionNext,
  PositionQuestionPhase,
  PositionField,
  PositionVoteStatus,
  Quadrant,
  Scenario,
  TwoQuadrant,
  TwoQuadrantField,
  TwoQuadrantPluralityNext,
  VideoPhase,
} from "./schema.js";

export { validateScenario } from "./validate.js";
export type { ScenarioIssue, ValidationResult } from "./validate.js";

export { statSizeWithNodeFs, validateMediaManifest } from "./media.js";
export type { MediaIssue, StatSize } from "./media.js";

// Quadrant assignment (half-open boundary convention) is shared domain
// logic; re-exported so scenario consumers need not import shared directly.
export { quadrantOf } from "@smartphonecracy/shared";
