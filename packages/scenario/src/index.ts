/**
 * Scenario types, validation, and graph utilities (plan §5).
 */

export const SCENARIO_SCHEMA_VERSION = 1;

export {
  countablePositionVoteStatusSchema,
  idlePhaseSchema,
  mediaManifestSchema,
  phaseSchema,
  positionQuestionNextSchema,
  positionQuestionPhaseSchema,
  positionVoteStatusSchema,
  quadrantSchema,
  scenarioSchema,
  videoPhaseSchema,
} from "./schema.js";
export type {
  CountablePositionVoteStatus,
  IdlePhase,
  MediaManifest,
  Phase,
  PhaseSnapshot,
  PositionQuestionNext,
  PositionQuestionPhase,
  PositionVoteStatus,
  Quadrant,
  Scenario,
  VideoPhase,
} from "./schema.js";

export { validateScenario } from "./validate.js";
export type { ScenarioIssue, ValidationResult } from "./validate.js";

export { statSizeWithNodeFs, validateMediaManifest } from "./media.js";
export type { MediaIssue, StatSize } from "./media.js";

// Quadrant assignment (half-open boundary convention) is shared domain
// logic; re-exported so scenario consumers need not import shared directly.
export { quadrantOf } from "@smartphonecracy/shared";
