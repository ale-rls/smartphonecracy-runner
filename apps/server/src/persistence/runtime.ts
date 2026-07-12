import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type { Scenario } from "@smartphonecracy/scenario";
import type { ServerConfig } from "../config.js";
import { InstallationPersistence } from "./persistence.js";
import { PostgresPersistenceExecutor, type PostgresQueryClient } from "./postgres-executor.js";
import { PersistenceWriteQueue, type PersistenceQueueHealthEvent } from "./write-queue.js";

const migrationPath = fileURLToPath(new URL("../../../../infra/migrations/001_persistence.sql", import.meta.url));

type PoolLike = {
  connect(): Promise<PostgresQueryClient & { release(): void }>;
  end(): Promise<void>;
};

export type PersistenceRuntime = {
  persistence: InstallationPersistence;
  close(): Promise<void>;
};

export type PersistenceRuntimeDependencies = {
  createPool?: (connectionString: string) => PoolLike;
  readMigration?: () => Promise<string>;
  log?: (event: PersistenceQueueHealthEvent) => void;
  now?: () => number;
};

export async function createPersistenceRuntime(
  config: ServerConfig,
  scenario: Scenario,
  dependencies: PersistenceRuntimeDependencies = {},
): Promise<PersistenceRuntime | null> {
  if (config.databaseUrl === undefined) return null;
  if (config.participantDataExpiresAt === undefined) {
    throw new Error("participant data expiry is required with persistence");
  }

  const pool = dependencies.createPool?.(config.databaseUrl) ?? new Pool({ connectionString: config.databaseUrl });
  const client = await pool.connect();
  try {
    const migration = await (dependencies.readMigration?.() ?? readFile(migrationPath, "utf8"));
    await client.query(migration);
    const executor = new PostgresPersistenceExecutor(client);
    let persistence: InstallationPersistence | undefined;
    const queue = new PersistenceWriteQueue(executor, {
      onHealthEvent: (event) => {
        dependencies.log?.(event);
        // A full queue cannot persist its own overflow event without recursively
        // producing another overflow. Degraded/recovered events are queued and
        // become durable when the database is writable again.
        if (event.status !== "buffer-full") {
          persistence?.recordHealthEvent(event, dependencies.now?.() ?? Date.now());
        }
      },
    });
    persistence = new InstallationPersistence({
      queue,
      installationId: config.installationId,
      scenario,
      participantDataExpiresAt: config.participantDataExpiresAt,
    });
    await persistence.flush();
    await persistence.recoverAfterCrash(dependencies.now?.() ?? Date.now());
    await persistence.flush();
    return {
      persistence,
      close: async () => {
        client.release();
        await pool.end();
      },
    };
  } catch (error) {
    client.release();
    await pool.end();
    throw error;
  }
}
