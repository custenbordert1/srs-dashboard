/**
 * P161.1 — Executive endpoint timing audit (read-only).
 * Verifies cached snapshot endpoints respond in <500ms after warm-up.
 *
 * Usage: npx tsx scripts/p161.1-executive-timing-audit.ts
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  loadEnvLocal();
  const baseUrl = process.env.P161_AUDIT_BASE_URL ?? "http://localhost:3000";
  const email = process.env.P161_AUDIT_EMAIL ?? "executive@srsmerchandising.com";
  const password = process.env.P161_AUDIT_PASSWORD ?? "SRS-Dashboard-2026!";

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const cookie = loginRes.headers.get("set-cookie") ?? "";

  const endpoints = [
    "/api/recruiting/app-health",
    "/api/recruiting/production-readiness",
    "/api/recruiting/operations-control-center",
  ];

  const results: { endpoint: string; coldMs: number; warmMs: number; meta: unknown }[] = [];

  for (const endpoint of endpoints) {
    const headers = { Cookie: cookie };

    const t0 = performance.now();
    const cold = await fetch(`${baseUrl}${endpoint}`, { headers, cache: "no-store" });
    const coldMs = Math.round(performance.now() - t0);
    const coldJson = await cold.json();

    const t1 = performance.now();
    const warm = await fetch(`${baseUrl}${endpoint}`, { headers, cache: "no-store" });
    const warmMs = Math.round(performance.now() - t1);
    const warmJson = await warm.json();

    results.push({
      endpoint,
      coldMs,
      warmMs,
      meta: warmJson.meta ?? null,
    });
  }

  console.log("\n=== Executive endpoint timing ===");
  for (const r of results) {
    const meta = r.meta as { cached?: boolean; stale?: boolean; refreshing?: boolean; ageSeconds?: number } | null;
    console.log(
      `${r.endpoint}: cold=${r.coldMs}ms warm=${r.warmMs}ms cached=${meta?.cached} stale=${meta?.stale} refreshing=${meta?.refreshing} age=${meta?.ageSeconds}s`,
    );
  }

  const failures = results.filter((r) => r.warmMs >= 500);
  if (failures.length > 0) {
    console.error("\nFAIL: warm responses exceed 500ms target:", failures.map((f) => f.endpoint));
    process.exit(1);
  }
  console.log("\nTIMING PASS ✔ (all warm <500ms)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
