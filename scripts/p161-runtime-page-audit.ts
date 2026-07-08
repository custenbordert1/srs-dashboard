/**
 * P161 runtime page audit — detects infinite skeleton / hang states in the browser.
 *
 * Usage: npx tsx scripts/p161-runtime-page-audit.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type PageSpec = { name: string; url: string };

const PAGES: PageSpec[] = [
  { name: "Command Center", url: "/?tab=command-center" },
  { name: "Executive Home", url: "/?tab=executive-home" },
  { name: "Recruiter Ops", url: "/?tab=recruiter-command-center" },
  { name: "Recruiter Dashboard", url: "/?tab=recruiter-dashboard" },
  { name: "Candidates", url: "/?tab=candidates" },
  { name: "Job Management", url: "/?tab=job-management" },
  { name: "Approval Queue", url: "/?tab=approval-queue" },
  { name: "DM Scorecards", url: "/?tab=dm-scorecards" },
  { name: "MEL Projects", url: "/?tab=mel-projects" },
  { name: "Workforce (tab)", url: "/?tab=workforce" },
  { name: "Data Health", url: "/?tab=data-health" },
  { name: "Recruiting Intelligence", url: "/?tab=recruiting-intelligence" },
  { name: "Workforce Intelligence", url: "/?tab=workforce-intelligence" },
  { name: "Recruiting Autopilot", url: "/?tab=recruiting-autopilot" },
  { name: "Autopilot Ops (tab)", url: "/?tab=recruiting-autopilot-ops" },
  { name: "Execution Center", url: "/?tab=recruiting-execution" },
  { name: "Hiring & Placement", url: "/?tab=placement-command-center" },
  { name: "Operations Control Center", url: "/executive/operations-control-center" },
  { name: "Production Readiness", url: "/executive/production-readiness" },
  { name: "Recruiting Priorities", url: "/executive/recruiting-priorities" },
  { name: "Recruiting Decisions", url: "/executive/recruiting-decisions" },
  { name: "Recruiter Assignment Center", url: "/executive/recruiter-assignment-center" },
  { name: "Autopilot Ops (standalone)", url: "/executive/recruiting-autopilot-operations" },
];

type Snapshot = {
  skeletonCount: number;
  ariaBusy: number;
  degradedBanner: boolean;
  errorCard: boolean;
  disabledBadge: boolean;
  headingCount: number;
  buttonCount: number;
  bodyTextLength: number;
  hasRetry: boolean;
};

type PageResult = {
  name: string;
  url: string;
  at5s: Snapshot;
  at10s: Snapshot;
  at20s: Snapshot;
  classification:
    | "loads_successfully"
    | "loads_degraded_banner"
    | "loads_stale_cache"
    | "infinite_skeleton"
    | "indefinite_hang";
  notes: string;
};

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const { execSync } = await import("node:child_process");
    execSync("npm install --no-save playwright@1.51.0", { stdio: "inherit" });
    return import("playwright");
  }
}

async function readSnapshot(page: import("playwright").Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const skeletonCount = document.querySelectorAll(".animate-pulse").length;
    const ariaBusy = document.querySelectorAll("[aria-busy='true']").length;
    const text = document.body?.innerText ?? "";
    const degradedBanner =
      text.includes("Cached snapshot") ||
      text.includes("Showing last") ||
      text.includes("degraded") ||
      text.includes("timed out") ||
      text.includes("unavailable");
    const errorCard =
      document.querySelectorAll("[role='alert']").length > 0 &&
      (text.includes("Retry") || text.includes("unavailable") || text.includes("timed out"));
    const disabledBadge =
      text.includes("Disabled by design") ||
      text.includes("Observation mode") ||
      text.includes("Manual mode");
    const headingCount = document.querySelectorAll("h1,h2,h3").length;
    const buttonCount = document.querySelectorAll("button").length;
    const hasRetry = Array.from(document.querySelectorAll("button")).some((b) =>
      (b.textContent ?? "").toLowerCase().includes("retry"),
    );
    return {
      skeletonCount,
      ariaBusy,
      degradedBanner,
      errorCard,
      disabledBadge,
      headingCount,
      buttonCount,
      bodyTextLength: text.length,
      hasRetry,
    };
  });
}

function classify(s5: Snapshot, s10: Snapshot, s20: Snapshot): { classification: PageResult["classification"]; notes: string } {
  const snapshots = [s5, s10, s20];
  const skeletons = snapshots.map((s) => s.skeletonCount);
  const busy = snapshots.map((s) => s.ariaBusy);
  const textLens = snapshots.map((s) => s.bodyTextLength);

  const stillSkeletonAt20 = s20.skeletonCount >= 3 && s20.bodyTextLength < 400;
  const skeletonNotDecreasing =
    s20.skeletonCount >= s10.skeletonCount && s10.skeletonCount >= s5.skeletonCount && s20.skeletonCount >= 4;

  if (stillSkeletonAt20 || (skeletonNotDecreasing && s20.ariaBusy > 0)) {
    return { classification: "infinite_skeleton", notes: `Skeletons persist at 20s (${s20.skeletonCount})` };
  }

  if (s20.bodyTextLength < 120 && s20.headingCount === 0 && s20.buttonCount <= 2) {
    return { classification: "indefinite_hang", notes: "Minimal DOM at 20s — likely blank/hung" };
  }

  if (s20.degradedBanner || s20.errorCard) {
    if (s20.bodyTextLength > 500 && s20.headingCount > 0 && s20.skeletonCount < 3) {
      return {
        classification: "loads_degraded_banner",
        notes: "Degraded/error UI with meaningful content",
      };
    }
    if (s20.hasRetry && s20.skeletonCount < 3) {
      return { classification: "loads_degraded_banner", notes: "Error card with retry, not skeleton" };
    }
  }

  if (
    s5.skeletonCount > s20.skeletonCount &&
    s20.bodyTextLength > 600 &&
    (s20.degradedBanner || s5.skeletonCount >= 3)
  ) {
    return { classification: "loads_stale_cache", notes: "Skeleton cleared; content visible (possible cache)" };
  }

  if (s20.bodyTextLength > 400 && s20.headingCount > 0 && s20.skeletonCount < 4) {
    return { classification: "loads_successfully", notes: "Content rendered" };
  }

  if (s20.disabledBadge && s20.bodyTextLength > 200) {
    return { classification: "loads_successfully", notes: "Disabled-by-design state shown" };
  }

  if (textLens[2] > textLens[0] + 200 && s20.skeletonCount <= 2) {
    return { classification: "loads_successfully", notes: "Progressive load completed" };
  }

  return {
    classification: "infinite_skeleton",
    notes: `Ambiguous — skeletons=${s20.skeletonCount} text=${s20.bodyTextLength}`,
  };
}

async function main() {
  const baseUrl = process.env.P161_AUDIT_BASE_URL ?? "http://localhost:3000";
  const email = process.env.P161_AUDIT_EMAIL ?? "executive@srsmerchandising.com";
  const password = process.env.P161_AUDIT_PASSWORD ?? "SRS-Dashboard-2026!";

  const { chromium, request } = await loadPlaywright();

  const api = await request.newContext({ baseURL: baseUrl });
  const loginRes = await api.post("/api/auth/login", { data: { email, password } });
  if (!loginRes.ok()) {
    throw new Error(`Login failed: HTTP ${loginRes.status()} ${await loginRes.text()}`);
  }
  const storageState = await api.storageState();
  await api.dispose();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  // Confirm session works
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    throw new Error("Session cookie not applied — still redirected to login");
  }

  const results: PageResult[] = [];

  for (const spec of PAGES) {
    try {
      await page.goto(`${baseUrl}${spec.url}`, { waitUntil: "commit", timeout: 60_000 });
      await page.waitForTimeout(5000);
      const at5s = await readSnapshot(page);
      await page.waitForTimeout(5000);
      const at10s = await readSnapshot(page);
      await page.waitForTimeout(10_000);
      const at20s = await readSnapshot(page);
      const { classification, notes } = classify(at5s, at10s, at20s);
      results.push({ name: spec.name, url: spec.url, at5s, at10s, at20s, classification, notes });
      console.log(`${spec.name}: ${classification} — ${notes}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const empty: Snapshot = {
        skeletonCount: 0,
        ariaBusy: 0,
        degradedBanner: false,
        errorCard: false,
        disabledBadge: false,
        headingCount: 0,
        buttonCount: 0,
        bodyTextLength: 0,
        hasRetry: false,
      };
      results.push({
        name: spec.name,
        url: spec.url,
        at5s: empty,
        at10s: empty,
        at20s: empty,
        classification: "indefinite_hang",
        notes: `Navigation/runtime error: ${message.slice(0, 200)}`,
      });
      console.log(`${spec.name}: indefinite_hang — ${message.slice(0, 120)}`);
    }
  }

  await browser.close();

  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    loads_successfully: results.filter((r) => r.classification === "loads_successfully").length,
    loads_degraded_banner: results.filter((r) => r.classification === "loads_degraded_banner").length,
    loads_stale_cache: results.filter((r) => r.classification === "loads_stale_cache").length,
    infinite_skeleton: results.filter((r) => r.classification === "infinite_skeleton").length,
    indefinite_hang: results.filter((r) => r.classification === "indefinite_hang").length,
    failures: results.filter(
      (r) => r.classification === "infinite_skeleton" || r.classification === "indefinite_hang",
    ),
  };

  await mkdir("artifacts", { recursive: true });
  const out = path.join("artifacts", "p161-runtime-page-audit.json");
  await writeFile(out, `${JSON.stringify({ summary, results }, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${out}`);
  console.log(JSON.stringify(summary, null, 2));

  if (summary.infinite_skeleton > 0 || summary.indefinite_hang > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
