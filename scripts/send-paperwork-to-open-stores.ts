/**
 * Send paperwork to qualified applicants for open store positions from Trends Excel.
 *
 * Dry-run by default (zero Dropbox / Breezy durable writes via P243):
 *   node --import tsx scripts/send-paperwork-to-open-stores.ts --dry-run
 *
 * Sheet match only (fast, no Breezy API):
 *   node --import tsx scripts/send-paperwork-to-open-stores.ts --dry-run --sheet-only
 *
 * Canary live (requires confirm; default max 5 applicants):
 *   node --import tsx scripts/send-paperwork-to-open-stores.ts --live --confirm-live --canary-limit=5
 *
 * Force human_review → auto_advance (LIVE ONLY; still respects canary/idempotency):
 *   node --import tsx scripts/send-paperwork-to-open-stores.ts --live --confirm-live --canary-limit=5 --force-auto-advance --show-applicants
 *
 * Options:
 *   --xlsx=<path>           Trends_Posts_With_Applicants workbook (..xlsx or .xlsx)
 *   --limit=<n>             Cap open stores (after ranking by applicant count)
 *   --force-fresh-reset     P243 in-memory fresh-new reset before scoring
 *   --force-auto-advance    Bypass human_review → auto_advance (requires --live --confirm-live)
 *   --confirm "<phrase>"    P122 confirmation phrase (auto-injected when --live --confirm-live)
 *   --sheet-only            Parse/match only (no Breezy API / no P243 cycle)
 *   --show-applicants       Print per-applicant planned/sent/skipped list
 *   --json                  Also print full JSON report to stdout
 *   --help                  Show this usage
 *
 * Place workbook at artifacts/Trends_Posts_With_Applicants..xlsx
 * (also searches repo root, data/, Desktop, Downloads for both ..xlsx and .xlsx)
 *
 * Live also requires:
 *   export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true
 *   export AUTONOMOUS_PAPERWORK_LIVE_MODE=true
 *   export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  defaultXlsxHint,
  formatOpenStoresPaperworkMarkdown,
  formatOpenStoresPaperworkStdout,
  resolveDefaultXlsxPath,
  runOpenStoresPaperworkSend,
} from "@/lib/open-stores-paperwork-send";
import { assertForceAutoAdvanceAllowed } from "@/lib/open-stores-paperwork-send/force-auto-advance";
import {
  LIVE_PILOT_ENV_EXPORT_BLOCK,
  resolveOpenStoresConfirmationPhrase,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function readNumberFlag(argv: string[], name: string, fallback: number | null): number | null {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) {
    const n = Number(inline.slice(`--${name}=`.length));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0) {
    const n = Number(argv[idx + 1]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
  return fallback;
}

function readStringFlag(argv: string[], name: string): string | null {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(`--${name}=`.length) || null;
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0) return argv[idx + 1] ?? null;
  return null;
}

function printHelp(): void {
  console.log(`Open stores paperwork send

Usage:
  node --import tsx scripts/send-paperwork-to-open-stores.ts [options]

Examples:
  node --import tsx scripts/send-paperwork-to-open-stores.ts --dry-run
  node --import tsx scripts/send-paperwork-to-open-stores.ts --dry-run --sheet-only
  node --import tsx scripts/send-paperwork-to-open-stores.ts --live --confirm-live --canary-limit=5
  node --import tsx scripts/send-paperwork-to-open-stores.ts --live --confirm-live --canary-limit=3 --force-auto-advance --show-applicants

Live prerequisites (fail-fast if missing):
${LIVE_PILOT_ENV_EXPORT_BLOCK}

Options:
  --dry-run                 Plan only (default when --live is omitted)
  --live --confirm-live     Enable live paperwork path (both required)
  --confirm "<phrase>"      P122 phrase (default auto-injected: "${P122_CONFIRMATION_PHRASE}" when --live --confirm-live)
  --canary-limit=<n>        Max live auto_advance sends (default 5)
  --limit=<n>               Cap open stores processed (highest applicant count first)
  --xlsx=<path>             Trends workbook path
  --force-fresh-reset       P243 in-memory fresh-new reset before scoring
  --force-auto-advance      Treat human_review as auto_advance (REQUIRES --live --confirm-live)
  --sheet-only              Excel match only (no Breezy / no P243 cycle)
  --show-applicants         Print per-applicant planned/sent/skipped list
  --json                    Dump full JSON report to stdout
  --help                    Show this help

Safety: canary, idempotency, already-sent, state-machine, and Dropbox testMode
preflight still apply even with --force-auto-advance.
When --live --confirm-live is set, confirmation phrase "${P122_CONFIRMATION_PHRASE}"
is auto-applied (override with --confirm).
`);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const live = argv.includes("--live") || argv.includes("--dry-run=false");
  const dryRunFlag = argv.includes("--dry-run");
  const confirmLive = argv.includes("--confirm-live") || argv.includes("--confirmLive");
  const forceFreshReset =
    argv.includes("--force-fresh-reset") ||
    argv.includes("--forceFreshReset") ||
    argv.includes("--force-fresh-data");
  const forceAutoAdvance =
    argv.includes("--force-auto-advance") || argv.includes("--forceAutoAdvance");
  const sheetOnly = argv.includes("--sheet-only") || argv.includes("--sheetOnly");
  const showApplicants =
    argv.includes("--show-applicants") || argv.includes("--showApplicants");
  const printJson = argv.includes("--json");
  const canaryLimit = readNumberFlag(argv, "canary-limit", 5) ?? 5;
  const limit = readNumberFlag(argv, "limit", null);
  const xlsxFlag = readStringFlag(argv, "xlsx");
  const confirmFlag = readStringFlag(argv, "confirm");

  if (live && !confirmLive) {
    console.error("Live mode requires --confirm-live (refusing to start).");
    process.exit(2);
  }

  const dryRun = dryRunFlag || !live;
  const { phrase: confirmationPhrase, autoInjected } = resolveOpenStoresConfirmationPhrase({
    live: !dryRun,
    confirmLive: !dryRun && confirmLive,
    confirmFlag,
  });

  if (autoInjected && confirmationPhrase) {
    console.error(
      `[open-stores] AUTO-APPLIED P122 confirmation phrase: "${confirmationPhrase}" ` +
        `(because --live --confirm-live). Override with --confirm "…".`,
    );
  } else if (!dryRun && confirmationPhrase) {
    console.error(`[open-stores] Using --confirm phrase: "${confirmationPhrase}"`);
  }

  try {
    assertForceAutoAdvanceAllowed({
      forceAutoAdvance,
      dryRun,
      confirmLive: !dryRun && confirmLive,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  const xlsxPath = xlsxFlag || resolveDefaultXlsxPath();
  if (!xlsxPath) {
    console.error(
      `Excel not found. Pass --xlsx=<path> or place either file at:\n` +
        `  ${defaultXlsxHint()}\n` +
        `  ${defaultXlsxHint().replace("Applicants..xlsx", "Applicants.xlsx")}\n` +
        `Searched: repo root, artifacts/, data/, diagnostics/, Desktop, Downloads.`,
    );
    process.exit(2);
  }

  const report = await runOpenStoresPaperworkSend({
    xlsxPath,
    dryRun,
    confirmLive: !dryRun && confirmLive,
    canaryLimit,
    limit: limit ?? undefined,
    forceFreshReset,
    forceAutoAdvance,
    sheetOnly,
    confirmationPhrase,
  });

  mkdirSync("artifacts", { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join("artifacts", `open-stores-paperwork-${stamp}.json`);
  const mdPath = path.join("artifacts", `open-stores-paperwork-${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, formatOpenStoresPaperworkMarkdown(report));

  console.log(formatOpenStoresPaperworkStdout(report, { showApplicants }));
  console.log(` Artifacts: ${jsonPath}`);
  console.log(`            ${mdPath}`);
  if (printJson) {
    console.log("");
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
