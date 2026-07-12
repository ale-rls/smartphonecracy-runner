import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";
import { loadScenarioReadiness } from "./readiness.js";
import { createPersistenceRuntime, type PersistenceQueueHealthEvent } from "./persistence/index.js";

export * from "./config.js";
export * from "./readiness.js";
export * from "./server.js";
export * from "./admission/index.js";
export * from "./engine/phase-engine.js";
export * from "./persistence/index.js";

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const readiness = await loadScenarioReadiness(config);
  const persistenceRuntime = readiness.ready
    ? await createPersistenceRuntime(config, readiness.scenario, {
        log: (event: PersistenceQueueHealthEvent) => console.error(JSON.stringify({ component: "persistence", ...event })),
      })
    : null;
  const { app, engine } = await buildServer({ config, ...(persistenceRuntime === null ? {} : { persistence: persistenceRuntime.persistence }) });
  engine?.recoverAfterCrash();
  let closing = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
    } finally {
      await persistenceRuntime?.close();
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    await persistenceRuntime?.close();
    throw error;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
