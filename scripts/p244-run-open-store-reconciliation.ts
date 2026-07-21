/**
 * P244 — Reconcile and Process Remaining Open-Store Applicants
 *
 * Package: p244-open-store-applicant-reconciliation
 *
 * Reconcile only (default):
 *   node --import tsx scripts/p244-run-open-store-reconciliation.ts
 *
 * Live batches (max 5; requires pilot env + confirm):
 *   export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true
 *   export AUTONOMOUS_PAPERWORK_LIVE_MODE=true
 *   export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true
 *   node --import tsx scripts/p244-run-open-store-reconciliation.ts \
 *     --live --confirm-live --execute --force-auto-advance --force-fresh-reset
 *
 * Artifacts:
 *   artifacts/p244-full-reconciliation.{md,json}
 *   artifacts/p244-remaining-74-disposition.json
 *   artifacts/p244-already-sent-verified.json
 *   artifacts/p244-recovered-candidates.json
 *   artifacts/p244-eligible-remaining.json
 *   artifacts/p244-new-confirmed-sends.json
 *   artifacts/p244-api-deferred.json
 *   artifacts/p244-still-blocked.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  LIVE_PILOT_ENV_EXPORT_BLOCK,
  resolveOpenStoresConfirmationPhrase,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import {
  defaultOpenStoreMatchesXlsxHint,
  resolveOpenStoreMatchesXlsxPath,
} from "@/lib/p243-open-store-bulk-paperwork-queue";
import {
  P244_OSAR_BATCH_SIZE,
  P244_OSAR_CONFIRMATION_PHRASE,
  runP244OpenStoreApplicantReconciliation,
} from "@/lib/p244-open-store-applicant-reconciliation";

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
  console.log(`P244 Open Store Applicant Reconciliation

Preview/reconcile:
  node --import tsx scripts/p244-run-open-store-reconciliation.ts

Live:
  ${LIVE_PILOT_ENV_EXPORT_BLOCK}
  node --import tsx scripts/p244-run-open-store-reconciliation.ts --live --confirm-live --execute --force-auto-advance --force-fresh-reset

Options:
  --dry-run                 Reconcile only (default)
  --live --confirm-live     Enable live path
  --execute                 Send eligible batches after reconcile
  --batch-size=<n>          Max ${P244_OSAR_BATCH_SIZE}
  --force-auto-advance      human_review → auto_advance (live only)
  --force-fresh-reset       Clear stale actionType before scoring
  --no-verify-dropbox       Skip live Dropbox signature verification
  --confirm "<phrase>"      Default: "${P244_OSAR_CONFIRMATION_PHRASE}"
  --xlsx=<path>
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
  const verifyDropbox = !argv.includes("--no-verify-dropbox");
  const batchSize = Math.min(
    P244_OSAR_BATCH_SIZE,
    readNumberFlag(argv, "batch-size", P244_OSAR_BATCH_SIZE),
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
    confirmFlag: confirmFlag ?? (execute ? P244_OSAR_CONFIRMATION_PHRASE : null),
  });
  if (autoInjected && confirmationPhrase) {
    console.error(`[p244-osar] AUTO-APPLIED confirmation phrase: "${confirmationPhrase}"`);
  } else if (confirmationPhrase) {
    console.error(`[p244-osar] Using confirmation phrase: "${confirmationPhrase}"`);
  }

  const xlsxPath = resolveOpenStoreMatchesXlsxPath(xlsxFlag);
  if (!xlsxPath) {
    console.error(
      `Excel not found. Place Open_Store_Candidate_Matches.xlsx at ${defaultOpenStoreMatchesXlsxHint()} ` +
        `(or Desktop/Downloads) or pass --xlsx=`,
    );
    process.exit(2);
  }

  console.error(
    `[p244-osar] Starting (dryRun=${dryRun}, execute=${execute}, batchSize=${batchSize}, xlsx=${xlsxPath})…`,
  );

  const { report, markdown } = await runP244OpenStoreApplicantReconciliation({
    xlsxPath,
    dryRun,
    confirmLive: !dryRun && confirmLive,
    execute,
    batchSize,
    forceAutoAdvance: forceAutoAdvance && !dryRun && confirmLive,
    forceFreshReset,
    confirmationPhrase: confirmationPhrase ?? P122_CONFIRMATION_PHRASE,
    approveOver60Ids: approveOver60,
    verifyDropbox,
  });

  writeArtifact("p244-full-reconciliation.json", report);
  writeArtifact("p244-full-reconciliation.md", markdown);
  writeArtifact("p244-remaining-74-disposition.json", report.remaining74);
  writeArtifact("p244-already-sent-verified.json", report.alreadySentVerified);
  writeArtifact("p244-recovered-candidates.json", report.recovered);
  writeArtifact("p244-eligible-remaining.json", report.eligibleRemaining);
  writeArtifact("p244-new-confirmed-sends.json", report.newConfirmedSends);
  writeArtifact("p244-api-deferred.json", report.apiDeferred);
  writeArtifact("p244-still-blocked.json", report.stillBlocked);

  const s = report.summary;
  console.log("");
  console.log("P244 Open Store Applicant Reconciliation");
  console.log(`  Total spreadsheet applicants:     ${s.totalSpreadsheetApplicants}`);
  console.log(`  P243 confirmed sends:             ${s.p243ConfirmedSends}`);
  console.log(`  Remaining applicants reviewed:    ${s.remainingApplicantsReviewed}`);
  console.log(`  Previously sent and verified:     ${s.previouslySentAndVerified}`);
  console.log(`  Already signed:                   ${s.alreadySigned}`);
  console.log(`  Ready for MEL / active in MEL:    ${s.readyForMelOrActiveInMel}`);
  console.log(`  Duplicates:                       ${s.duplicates}`);
  console.log(`  Invalid emails:                   ${s.invalidEmails}`);
  console.log(`  Missing ingestion / not found:    ${s.missingIngestionCandidates}`);
  console.log(`  Recovered candidates:             ${s.recoveredCandidates}`);
  console.log(`  Other blocked:                    ${s.otherBlockedCandidates}`);
  console.log(`  Eligible applicants found:        ${s.eligibleApplicantsFound}`);
  console.log(`  Additional sends attempted:       ${s.additionalSendsAttempted}`);
  console.log(`  Additional sends confirmed:       ${s.additionalSendsConfirmed}`);
  console.log(`  Deferred due to API capacity:     ${s.deferredDueToApiCapacity}`);
  console.log(`  Still requiring manual action:    ${s.stillRequiringManualAction}`);
  console.log(`  Remaining Dropbox safe capacity: ${s.remainingDropboxSafeCapacity ?? "—"}`);
  console.log(`  Dropbox testMode:                 ${report.dropboxTestMode}`);
  console.log(`  Live writes:                      ${report.liveWritesOccurred}`);
  if (report.stoppedOnSystemFailure) {
    console.log(`  STOPPED: ${report.systemStopReason}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
