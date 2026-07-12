import type { PersistenceExecutor, SqlStatement } from "./write-queue.js";

/** Compatible with pg PoolClient and intentionally keeps the pg package optional. */
export interface PostgresQueryClient {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
}

export class PostgresPersistenceExecutor implements PersistenceExecutor {
  constructor(private readonly client: PostgresQueryClient) {}

  async execute(statements: readonly SqlStatement[]): Promise<void> {
    await this.client.query("begin");
    try {
      for (const statement of statements) await this.client.query(statement.text, statement.values);
      await this.client.query("commit");
    } catch (error) {
      await this.client.query("rollback");
      throw error;
    }
  }
}
