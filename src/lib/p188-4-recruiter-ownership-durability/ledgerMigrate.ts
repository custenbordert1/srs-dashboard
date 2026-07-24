import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";
import {
  P1884_MIGRATION_001,
  P1884_MIGRATION_NAME,
} from "@/lib/p188-4-recruiter-ownership-durability/ledgerSchema";

export async function applyP1884Migrations(client: SqlClient): Promise<void> {
  const statements = P1884_MIGRATION_001.split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await client.query(statement);
  }
  await client.query(
    `INSERT INTO p188_schema_migrations (version, name)
     VALUES ($1, $2)
     ON CONFLICT (version) DO NOTHING`,
    [1, P1884_MIGRATION_NAME],
  );
}
