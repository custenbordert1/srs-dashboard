/**
 * P242 — Urgent Bulk Paperwork Push for Open Stores
 *
 * Preview (default — writes preview artifacts only, zero Dropbox sends):
 *   node --import tsx scripts/p242-run-open-store-paperwork-push.ts
 *
 * Live batches (max 10; requires pilot env + confirm):
 *   export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true
 *   export AUTONOMOUS_PAPERWORK_LIVE_MODE=true
 *   export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true
 *   node --import tsx scripts/p242-run-open-store-paperwork-push.ts \
 *     --live --confirm-live --execute --force-auto-advance --force-fresh-reset
 *
 * Artifacts:
 *   artifacts/p242-open-store-paperwork-preview.{md,json}
 *   artifacts/p242-eligible-candidates.json
 *   artifacts/p242-blocked-candidates.json
 *   artifacts/p242-open-store-paperwork-final.{md,json}
 *   artifacts/p242-sent-candidates.json
 *   artifacts/p242-failed-candidates.json
 *   artifacts/p242-store-coverage-summary.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  LIVE_PILOT_ENV_EXPORT_BLOCK,
  resolveOpenStoresConfirmationPhrase,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import {
  P242_MAX_BATCH,
  runP242OpenStorePaperworkPush,
  summarizeBlockedForJson,
  summarizeEligibleForJson,
} from "@/lib/p242-open-store-paperwork-push";
import { resolveDefaultXlsxPath, defaultXlsxHint } from "@/lib/open-stores-paperwork-send";

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

function readNumberFlag(argv: string[], name: string, fallback: number): number {
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

function writeArtifact(name: string, value: unknown): string {
  mkdirSync("artifacts", { recursive: true });
  const target = path.join("artifacts", name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
  console.log(`[artifact] ${target}`);
  return target;
}

function printHelp(): void {
  console.log(`P242 Open Store Paperwork Push

Preview:
  node --import tsx scripts/p242-run-open-store-paperwork-push.ts

Live:
  ${LIVE_PILOT_ENV_EXPORT_BLOCK}
  node --import tsx scripts/p242-run-open-store-paperwork-push.ts --live --confirm-live --execute --force-auto-advance --force-fresh-reset

Options:
  --dry-run                 Preview only (default)
  --live --confirm-live     Enable live path
  --execute                 Run eligible batches after preview (requires live+confirm)
  --batch-size=<n>          Max ${P242_MAX_BATCH} (default ${P242_MAX_BATCH})
  --force-auto-advance      human_review → auto_advance (live only)
  --force-fresh-reset       Clear stale actionType before scoring (default on for --execute)
  --no-force-fresh-reset    Disable fresh reset
  --confirm "<phrase>"      Default: "${P122_CONFIRMATION_PHRASE}"
  --xlsx=<path>             Trends workbook
  --approve-over-60=<id,id> Allow specific candidate ids despite >60 miles
  --help
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
  const execute = argv.includes("--execute");
  const forceAutoAdvance =
    argv.includes("--force-auto-advance") || argv.includes("--forceAutoAdvance");
  const noFresh = argv.includes("--no-force-fresh-reset");
  const forceFreshReset =
    !noFresh &&
    (argv.includes("--force-fresh-reset") ||
      argv.includes("--forceFreshReset") ||
      execute);
  const batchSize = Math.min(
    P242_MAX_BATCH,
    readNumberFlag(argv, "batch-size", P242_MAX_BATCH),
  );
  const xlsxFlag = readStringFlag(argv, "xlsx");
  const confirmFlag = readStringFlag(argv, "confirm");
  const approveOver60 = (readStringFlag(argv, "approve-over-60") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (live && !confirmLive) {
    console.error("Live mode requires --confirm-live.");
    process.exit(2);
  }
  if (execute && (!live || !confirmLive)) {
    console.error("--execute requires --live --confirm-live.");
    process.exit(2);
  }

  const dryRun = dryRunFlag || !live;
  const { phrase: confirmationPhrase, autoInjected } = resolveOpenStoresConfirmationPhrase({
    live: !dryRun,
    confirmLive: !dryRun && confirmLive,
    confirmFlag,
  });
  if (autoInjected && confirmationPhrase) {
    console.error(`[p242] AUTO-APPLIED confirmation phrase: "${confirmationPhrase}"`);
  }

  const xlsxPath = xlsxFlag || resolveDefaultXlsxPath();
  if (!xlsxPath) {
    console.error(`Excel not found. Place workbook at ${defaultXlsxHint()} or pass --xlsx=`);
    process.exit(2);
  }

  console.error(`[p242] Starting (dryRun=${dryRun}, execute=${execute}, batchSize=${batchSize})…`);

  const result = await runP242OpenStorePaperworkPush({
    xlsxPath,
    dryRun,
    confirmLive: !dryRun && confirmLive,
    execute,
    batchSize,
    forceAutoAdvance: forceAutoAdvance && !dryRun && confirmLive,
    forceFreshReset,
    confirmationPhrase,
    approveOver60Ids: approveOver60,
    assignTaylor: true,
    assignDm: true,
  });

  writeArtifact("p242-open-store-paperwork-preview.json", result.preview.report);
  writeArtifact("p242-open-store-paperwork-preview.md", result.preview.markdown);
  writeArtifact(
    "p242-eligible-candidates.json",
    summarizeEligibleForJson(result.preview.report.candidates),
  );
  writeArtifact(
    "p242-blocked-candidates.json",
    summarizeBlockedForJson(result.preview.report.candidates),
  );

  writeArtifact("p242-open-store-paperwork-final.json", result.final);
  writeArtifact("p242-open-store-paperwork-final.md", result.finalMarkdown);
  writeArtifact("p242-sent-candidates.json", result.final.sent);
  writeArtifact("p242-failed-candidates.json", result.final.failed);
  writeArtifact("p242-store-coverage-summary.json", result.final.storeCoverage);

  const s = result.final.summary;
  console.log("");
  console.log("P242 Open Store Paperwork Push");
  console.log(`  Open stores reviewed:     ${s.openStoresReviewed}`);
  console.log(`  Applicants found:         ${s.applicantsFound}`);
  console.log(`  Unique applicants:        ${s.uniqueApplicants}`);
  console.log(`  Eligible:                 ${s.eligible}`);
  console.log(`  Attempted:                ${s.attempted}`);
  console.log(`  Confirmed sends:          ${s.confirmedSends}`);
  console.log(`  Failed:                   ${s.failed}`);
  console.log(`  Already-sent exclusions:  ${s.alreadySentExclusions}`);
  console.log(`  Signed exclusions:        ${s.signedExclusions}`);
  console.log(
    `  Stores w/ no usable app:  ${s.remainingStoresWithNoUsableApplicant}`,
  );
  console.log(`  Dropbox testMode:         ${result.final.dropboxTestMode}`);
  console.log(`  Live writes occurred:     ${result.final.liveWritesOccurred}`);
  if (result.final.stoppedOnSystemFailure) {
    console.log(`  STOPPED: ${result.final.systemStopReason}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
