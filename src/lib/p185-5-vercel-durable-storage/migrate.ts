import { P1855_MIGRATION_001, P1855_MIGRATION_NAME } from "@/lib/p185-5-vercel-durable-storage/schema";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { P185_5_SCHEMA_VERSION, type SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

export async function applyP1855Migrations(client?: SqlClient): Promise<{
  applied: boolean;
  schemaVersion: number;
  alreadyApplied: boolean;
}> {
  const db = client ?? (await createSqlClient());
  // Split on statements carefully — PGlite/Neon accept multi-statement in some modes;
  // run as one script for PGlite, statement-by-statement for safety.
  const statements = P1855_MIGRATION_001
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.query(`${statement};`);
  }

  const existing = await db.query(
    "SELECT version FROM p1855_schema_migrations WHERE version = $1",
    [P185_5_SCHEMA_VERSION],
  );
  if (existing.rowCount > 0) {
    return { applied: true, schemaVersion: P185_5_SCHEMA_VERSION, alreadyApplied: true };
  }

  await db.query(
    "INSERT INTO p1855_schema_migrations (version, name) VALUES ($1, $2)",
    [P185_5_SCHEMA_VERSION, P1855_MIGRATION_NAME],
  );
  return { applied: true, schemaVersion: P185_5_SCHEMA_VERSION, alreadyApplied: false };
}

export async function getAppliedSchemaVersion(client?: SqlClient): Promise<number | null> {
  const db = client ?? (await createSqlClient());
  try {
    const result = await db.query(
      "SELECT MAX(version)::int AS version FROM p1855_schema_migrations",
    );
    const version = result.rows[0]?.version;
    return typeof version === "number" ? version : version != null ? Number(version) : null;
  } catch {
    return null;
  }
}
