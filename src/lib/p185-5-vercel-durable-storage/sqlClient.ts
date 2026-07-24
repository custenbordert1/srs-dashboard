import { createHash } from "node:crypto";
import type { P1855ProviderName, SqlClient, SqlParam, SqlQueryResult } from "@/lib/p185-5-vercel-durable-storage/types";

let cachedClient: SqlClient | null = null;
let cachedKey: string | null = null;

export function resolveDatabaseUrl(): string | null {
  const url =
    process.env.P185_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.NEON_DATABASE_URL?.trim() ||
    null;
  return url || null;
}

export function resolvePgliteDataDir(): string | null {
  const dir = process.env.P185_PGLITE_DATA_DIR?.trim();
  return dir || null;
}

export function isP1855DurableConfigured(): boolean {
  return Boolean(resolveDatabaseUrl() || resolvePgliteDataDir() || process.env.P185_5_FORCE_PGLITE === "1");
}

export function redactProviderName(provider: P1855ProviderName): string {
  if (provider === "unconfigured") return "unconfigured";
  return provider;
}

function detectProvider(url: string | null): P1855ProviderName {
  if (!url) {
    return resolvePgliteDataDir() || process.env.P185_5_FORCE_PGLITE === "1"
      ? "pglite_local"
      : "unconfigured";
  }
  if (/vercel-storage|postgres\.vercel/i.test(url)) return "vercel_postgres";
  return "neon_postgres";
}

export async function createSqlClient(input?: {
  databaseUrl?: string | null;
  pgliteDataDir?: string | null;
  forcePglite?: boolean;
  forceNew?: boolean;
}): Promise<SqlClient> {
  const databaseUrl = input?.databaseUrl ?? resolveDatabaseUrl();
  const pgliteDataDir = input?.pgliteDataDir ?? resolvePgliteDataDir();
  const forcePglite =
    input?.forcePglite === true ||
    process.env.P185_5_FORCE_PGLITE === "1" ||
    Boolean(pgliteDataDir && !databaseUrl) ||
    (!databaseUrl && process.env.P185_5_FORCE_PGLITE === "1");

  const usePglite = forcePglite || !databaseUrl;
  const cacheKey = !usePglite && databaseUrl
    ? `pg:${createHash("sha256").update(databaseUrl).digest("hex").slice(0, 12)}`
    : `pglite:${pgliteDataDir ?? "memory"}`;

  if (!input?.forceNew && cachedClient && cachedKey === cacheKey) {
    return cachedClient;
  }

  if (input?.forceNew && cachedClient) {
    try {
      await cachedClient.close();
    } catch {
      // ignore
    }
    cachedClient = null;
    cachedKey = null;
  }

  if (!usePglite && databaseUrl) {
    const { Pool } = await import("@neondatabase/serverless");
    const pool = new Pool({ connectionString: databaseUrl });
    const provider = detectProvider(databaseUrl);
    const client: SqlClient = {
      provider,
      async query(text, params = []): Promise<SqlQueryResult> {
        const result = await pool.query(text, params);
        return {
          rows: (result.rows ?? []) as Record<string, unknown>[],
          rowCount: result.rowCount ?? result.rows?.length ?? 0,
        };
      },
      async transaction(fn) {
        const conn = await pool.connect();
        const txClient: SqlClient = {
          provider,
          async query(text, params = []) {
            const result = await conn.query(text, params);
            return {
              rows: (result.rows ?? []) as Record<string, unknown>[],
              rowCount: result.rowCount ?? result.rows?.length ?? 0,
            };
          },
          async transaction(inner) {
            return inner(txClient);
          },
          async close() {
            // Transaction-scoped client — connection released by outer finally.
          },
        };
        try {
          await conn.query("BEGIN");
          const result = await fn(txClient);
          await conn.query("COMMIT");
          return result;
        } catch (err) {
          try {
            await conn.query("ROLLBACK");
          } catch {
            // ignore
          }
          throw err;
        } finally {
          conn.release();
        }
      },
      async close() {
        await pool.end();
        if (cachedKey === cacheKey) {
          cachedClient = null;
          cachedKey = null;
        }
      },
    };
    cachedClient = client;
    cachedKey = cacheKey;
    return client;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const db = pgliteDataDir ? new PGlite(pgliteDataDir) : new PGlite();
  await db.waitReady;
  const client: SqlClient = {
    provider: "pglite_local",
    async query(text, params = []): Promise<SqlQueryResult> {
      const result = await db.query(text, params as unknown[]);
      const rows = (result.rows ?? []) as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    },
    async transaction(fn) {
      await db.query("BEGIN");
      try {
        const result = await fn(client);
        await db.query("COMMIT");
        return result;
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    },
    async close() {
      await db.close();
      if (cachedKey === cacheKey) {
        cachedClient = null;
        cachedKey = null;
      }
    },
  };
  cachedClient = client;
  cachedKey = cacheKey;
  return client;
}

export async function resetSqlClientCacheForTests(): Promise<void> {
  const prior = cachedClient;
  cachedClient = null;
  cachedKey = null;
  if (prior) {
    try {
      await prior.close();
    } catch {
      // ignore close errors during test teardown
    }
  }
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export function hashEnvelopeId(envelopeId: string): string {
  return createHash("sha256").update(envelopeId).digest("hex").slice(0, 16);
}
