import { P186_1_MIGRATION_001, P186_1_MIGRATION_NAME } from "@/lib/p186-1-lifecycle-state-machine/schema";
import { P186_1_SCHEMA_VERSION } from "@/lib/p186-1-lifecycle-state-machine/types";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

export async function applyP1861Migrations(client?: SqlClient): Promise<{
  applied: boolean;
  schemaVersion: number;
  alreadyApplied: boolean;
}> {
  const db = client ?? (await createSqlClient());
  const statements = P186_1_MIGRATION_001.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.query(`${statement};`);
  }

  const existing = await db.query(
    "SELECT version FROM p186_schema_migrations WHERE version = $1",
    [P186_1_SCHEMA_VERSION],
  );
  if (existing.rowCount > 0) {
    return { applied: true, schemaVersion: P186_1_SCHEMA_VERSION, alreadyApplied: true };
  }

  await db.query("INSERT INTO p186_schema_migrations (version, name) VALUES ($1, $2)", [
    P186_1_SCHEMA_VERSION,
    P186_1_MIGRATION_NAME,
  ]);
  return { applied: true, schemaVersion: P186_1_SCHEMA_VERSION, alreadyApplied: false };
}

export async function getP1861SchemaVersion(client?: SqlClient): Promise<number | null> {
  const db = client ?? (await createSqlClient());
  try {
    const result = await db.query(
      "SELECT MAX(version)::int AS version FROM p186_schema_migrations",
    );
    const version = result.rows[0]?.version;
    return typeof version === "number" ? version : version != null ? Number(version) : null;
  } catch {
    return null;
  }
}
