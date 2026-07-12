import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { REPO_ROOT } from "./server.js";

let nextPort = 5190 + (process.pid % 300);

export type StudioServer = { baseUrl: string; stop(): Promise<void> };

const waitExit = (child: ChildProcess) => child.exitCode !== null
  ? Promise.resolve()
  : new Promise<void>((resolve) => child.once("exit", () => resolve()));

export async function startStudio(): Promise<StudioServer> {
  const port = nextPort++;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn("pnpm", ["--filter", "studio", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_ENV: "test" },
    stdio: "ignore",
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Studio dev server exited ${child.exitCode}`);
    try { if ((await fetch(baseUrl)).ok) return { baseUrl, async stop() { child.kill("SIGTERM"); await waitExit(child); } }; } catch { /* retry */ }
    await sleep(200);
  }
  child.kill("SIGKILL");
  throw new Error("Studio dev server did not become ready");
}
