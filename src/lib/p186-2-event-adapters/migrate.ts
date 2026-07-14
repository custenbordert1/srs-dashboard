import { applyP1861Migrations } from "@/lib/p186-1-lifecycle-state-machine/migrate";
import { P186_2_MIGRATION_002, P186_2_MIGRATION_NAME } from "@/lib/p186-2-event-adapters/schema";
import { P186_2_SCHEMA_VERSION } from "@/lib/p186-2-event-adapters/types";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

export async function applyP1862Migrations(client?: SqlClient): Promise<{
  applied: boolean;
  schemaVersion: number;
  alreadyApplied: boolean;
}> {
  const db = client ?? (await createSqlClient());
  await applyP1861Migrations(db);

  const statements = P186_2_MIGRATION_002.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await db.query(`${statement};`);
  }

  const existing = await db.query(
    "SELECT version FROM p186_schema_migrations WHERE version = $1",
    [P186_2_SCHEMA_VERSION],
  );
  if (existing.rowCount > 0) {
    return { applied: true, schemaVersion: P186_2_SCHEMA_VERSION, alreadyApplied: true };
  }
  await db.query("INSERT INTO p186_schema_migrations (version, name) VALUES ($1, $2)", [
    P186_2_SCHEMA_VERSION,
    P186_2_MIGRATION_NAME,
  ]);
  return { applied: true, schemaVersion: P186_2_SCHEMA_VERSION, alreadyApplied: false };
}
