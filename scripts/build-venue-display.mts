import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const displayDir = resolve(root, "apps/display");
const requireDisplay = createRequire(resolve(displayDir, "package.json"));
const serverUrl = process.env.VENUE_SERVER_URL ?? "https://smartphonocracy-venue-server.enabler.space";
if (!process.env.DISPLAY_TOKEN || process.env.DISPLAY_TOKEN === "REPLACE_WITH_LIVE_DISPLAY_TOKEN") {
  throw new Error("Set DISPLAY_TOKEN in .env.venue to the live venue server's display token.");
}
if (!process.env.REALTIME_WS_URL) throw new Error("Set REALTIME_WS_URL in .env.venue.");
const response = await fetch(new URL("/api/status", serverUrl), { signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`Live server status unavailable: ${response.status}`);
const status = await response.json() as { ready?: boolean; buildVersion?: string };
if (!status.ready || typeof status.buildVersion !== "string" || !status.buildVersion) {
  throw new Error("Live server is not ready or did not provide its build version. Retry after deployment completes.");
}
const env = { ...process.env, BUILD_VERSION: status.buildVersion };
console.log(`Building local venue display for live server version ${status.buildVersion}`);
for (const [cli, args] of [
  [requireDisplay.resolve("typescript/bin/tsc"), ["--noEmit"]],
  [resolve(dirname(requireDisplay.resolve("vite/package.json")), "bin/vite.js"), ["build"]],
] as const) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: displayDir, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Ready: apps/display/dist. Restart the venue player and reload the display.");
