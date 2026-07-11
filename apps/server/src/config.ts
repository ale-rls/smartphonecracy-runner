import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  BUILD_VERSION: z.string().min(1).default("dev"),
  INSTALLATION_ID: z.string().min(1).default("dev-installation"),
  ROOM_ID: z.string().min(1).default("main"),
  DISPLAY_TOKEN: z.string().min(1).default("dev-display-token"),
  PHONE_JOIN_BASE_URL: z.string().url().default("http://localhost:5174/"),
  SCENARIO_PATH: z.string().min(1).optional(),
  MEDIA_MANIFEST_PATH: z.string().min(1).optional(),
  MEDIA_DIR: z.string().min(1).optional(),
  DISPLAY_DIST_DIR: z.string().min(1).optional(),
  PHONE_DIST_DIR: z.string().min(1).optional(),
  ADMIN_DIST_DIR: z.string().min(1).optional(),
});

export type ServerConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  buildVersion: string;
  installationId: string;
  roomId: string;
  displayToken: string;
  phoneJoinBaseUrl: string;
  scenarioPath: string;
  mediaManifestPath: string;
  mediaDir: string;
  bundleDirs: Record<"display" | "phone" | "admin", string>;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Parse environment input once and resolve every file path from the repo root. */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  rootDir = repoRoot,
): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`invalid server configuration: ${details}`);
  }

  const value = parsed.data;
  const fromRoot = (path: string | undefined, fallback: string) =>
    resolve(rootDir, path ?? fallback);

  return {
    nodeEnv: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    buildVersion: value.BUILD_VERSION,
    installationId: value.INSTALLATION_ID,
    roomId: value.ROOM_ID,
    displayToken: value.DISPLAY_TOKEN,
    phoneJoinBaseUrl: value.PHONE_JOIN_BASE_URL,
    scenarioPath: fromRoot(value.SCENARIO_PATH, "content/scenarios/dev.json"),
    mediaManifestPath: fromRoot(value.MEDIA_MANIFEST_PATH, "content/media-manifest.json"),
    mediaDir: fromRoot(value.MEDIA_DIR, "content/media"),
    bundleDirs: {
      display: fromRoot(value.DISPLAY_DIST_DIR, "apps/display/dist"),
      phone: fromRoot(value.PHONE_DIST_DIR, "apps/phone/dist"),
      admin: fromRoot(value.ADMIN_DIST_DIR, "apps/admin/dist"),
    },
  };
}
