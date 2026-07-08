/**
 * P161.1 — Executive page runtime audit (focused, ~90s).
 *
 * Usage: npx tsx scripts/p161.1-executive-page-audit.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const EXECUTIVE_PAGES = [
  { name: "Executive Home", url: "/?tab=executive-home" },
  { name: "Operations Control Center", url: "/executive/operations-control-center" },
  { name: "Production Readiness", url: "/executive/production-readiness" },
];

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const { execSync } = await import("node:child_process");
    execSync("npx playwright install chromium", { stdio: "inherit" });
    return import("playwright");
  }
}

async function main() {
  const baseUrl = process.env.P161_AUDIT_BASE_URL ?? "http://localhost:3000";
  const email = process.env.P161_AUDIT_EMAIL ?? "executive@srsmerchandising.com";
  const password = process.env.P161_AUDIT_PASSWORD ?? "SRS-Dashboard-2026!";

  const { chromium, request } = await loadPlaywright();
  const api = await request.newContext({ baseURL: baseUrl });
  const loginRes = await api.post("/api/auth/login", { data: { email, password } });
  if (!loginRes.ok()) throw new Error(`Login failed: ${loginRes.status()}`);
  const storageState = await api.storageState();
  await api.dispose();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  const results: Record<string, unknown>[] = [];

  for (const spec of EXECUTIVE_PAGES) {
    const t0 = Date.now();
    await page.goto(`${baseUrl}${spec.url}`, { waitUntil: "commit", timeout: 60_000 });

    // Check at 2s — should have content (not infinite skeleton)
    await page.waitForTimeout(2000);
    const at2s = await page.evaluate(() => ({
      skeletonCount: document.querySelectorAll(".animate-pulse").length,
      textLength: document.body?.innerText?.length ?? 0,
      hasLastUpdated: (document.body?.innerText ?? "").includes("Last updated"),
      hasRefreshing: (document.body?.innerText ?? "").includes("Refreshing"),
      hasDegraded: (document.body?.innerText ?? "").includes("warming up") ||
        (document.body?.innerText ?? "").includes("stale") ||
        (document.body?.innerText ?? "").includes("Cached snapshot"),
      headingCount: document.querySelectorAll("h1,h2,h3").length,
    }));

    await page.waitForTimeout(8000);
    const at10s = await page.evaluate(() => ({
      skeletonCount: document.querySelectorAll(".animate-pulse").length,
      textLength: document.body?.innerText?.length ?? 0,
      hasLastUpdated: (document.body?.innerText ?? "").includes("Last updated"),
      hasRefreshing: (document.body?.innerText ?? "").includes("Refreshing"),
      headingCount: document.querySelectorAll("h1,h2,h3").length,
    }));

    const infiniteSkeleton = at10s.skeletonCount >= 4 && at10s.textLength < 400;
    const loadsImmediately = at2s.textLength > 300 && at2s.headingCount > 0 && at2s.skeletonCount < 4;

    results.push({
      name: spec.name,
      url: spec.url,
      elapsedMs: Date.now() - t0,
      at2s,
      at10s,
      classification: infiniteSkeleton
        ? "infinite_skeleton"
        : loadsImmediately
          ? "loads_immediately"
          : at10s.textLength > 400
            ? "loads_successfully"
            : "ambiguous",
    });

    console.log(
      `${spec.name}: ${loadsImmediately ? "IMMEDIATE" : at10s.textLength > 400 ? "OK" : "SLOW"} ` +
        `(2s: skeleton=${at2s.skeletonCount} text=${at2s.textLength} lastUpdated=${at2s.hasLastUpdated})`,
    );
  }

  await browser.close();

  const failures = results.filter(
    (r) => r.classification === "infinite_skeleton" || r.classification === "ambiguous",
  );

  const report = {
    generatedAt: new Date().toISOString(),
    sourcePhase: "P161.1",
    results,
    pass: failures.length === 0,
  };

  const dir = path.join(process.cwd(), "artifacts");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "p161.1-executive-page-audit.json"),
    JSON.stringify(report, null, 2),
  );

  if (failures.length > 0) {
    console.error("\nFAIL:", failures.map((f) => f.name));
    process.exit(1);
  }
  console.log("\nEXECUTIVE PAGE AUDIT PASS ✔");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
