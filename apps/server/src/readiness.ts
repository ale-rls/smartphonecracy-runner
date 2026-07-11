import { readFile } from "node:fs/promises";
import {
  mediaManifestSchema,
  scenarioSchema,
  statSizeWithNodeFs,
  validateMediaManifest,
  validateScenario,
  type Scenario,
} from "@smartphonecracy/scenario";
import type { ServerConfig } from "./config.js";

export type ScenarioReadiness =
  | { ready: true; scenario: Scenario; warnings: string[] }
  | { ready: false; scenario: null; errors: string[]; warnings: string[] };

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Validate all deployment content without preventing liveness endpoints from booting. */
export async function loadScenarioReadiness(
  config: Pick<ServerConfig, "scenarioPath" | "mediaManifestPath" | "mediaDir">,
): Promise<ScenarioReadiness> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let scenarioRaw: unknown;
  let manifestRaw: unknown;
  try {
    scenarioRaw = await readJson(config.scenarioPath);
  } catch (error) {
    errors.push(`scenario: ${(error as Error).message}`);
  }
  try {
    manifestRaw = await readJson(config.mediaManifestPath);
  } catch (error) {
    errors.push(`media manifest: ${(error as Error).message}`);
  }

  const scenarioResult = scenarioSchema.safeParse(scenarioRaw);
  if (!scenarioResult.success) {
    errors.push(
      ...scenarioResult.error.issues.map(
        (issue) => `scenario ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    );
  }
  const manifestResult = mediaManifestSchema.safeParse(manifestRaw);
  if (!manifestResult.success) {
    errors.push(
      ...manifestResult.error.issues.map(
        (issue) => `media manifest ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    );
  }

  if (scenarioResult.success && manifestResult.success) {
    const graph = validateScenario(scenarioResult.data, manifestResult.data);
    errors.push(...graph.errors.map((issue) => issue.message));
    warnings.push(...graph.warnings.map((issue) => issue.message));

    const media = await validateMediaManifest(
      manifestResult.data,
      statSizeWithNodeFs(config.mediaDir),
    );
    errors.push(...media.errors.map((issue) => issue.message));
  }

  if (errors.length > 0 || !scenarioResult.success) {
    return { ready: false, scenario: null, errors, warnings };
  }
  return { ready: true, scenario: scenarioResult.data, warnings };
}
