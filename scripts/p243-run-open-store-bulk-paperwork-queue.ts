/**
 * P243 — Bulk Paperwork Queue for Open Store Candidates
 *
 * (Package: p243-open-store-bulk-paperwork-queue — avoids collision with
 * p243-autonomous-end-to-end-pipeline.)
 *
 * Preview (default — writes preview artifacts only, zero Dropbox sends):
 *   node --import tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts
 *
 * Live batches (max 5; requires pilot env + confirm):
 *   export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true
 *   export AUTONOMOUS_PAPERWORK_LIVE_MODE=true
 *   export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true
 *   node --import tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts \
 *     --live --confirm-live --execute --force-auto-advance --force-fresh-reset
 *
 * Optional capacity override when Dropbox quota is unclear:
 *   export DROPBOX_SIGN_SAFE_SEND_CAP=25
 *
 * Artifacts (exact names):
 *   artifacts/p243-preview.{md,json}
 *   artifacts/p243-final.{md,json}
 *   artifacts/p243-confirmed-sends.json
 *   artifacts/p243-deferred.json
 *   artifacts/p243-failures.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  LIVE_PILOT_ENV_EXPORT_BLOCK,
  resolveOpenStoresConfirmationPhrase,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import {
  P243_OSBPQ_BATCH_SIZE,
  P243_OSBPQ_CONFIRMATION_PHRASE,
  defaultOpenStoreMatchesXlsxHint,
  resolveOpenStoreMatchesXlsxPath,
  runP243OpenStoreBulkPaperworkQueue,
} from "@/lib/p243-open-store-bulk-paperwork-queue";

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
  console.log(`P243 Open Store Bulk Paperwork Queue

Preview:
  node --import tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts

Live:
  ${LIVE_PILOT_ENV_EXPORT_BLOCK}
  node --import tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts --live --confirm-live --execute --force-auto-advance --force-fresh-reset

Options:
  --dry-run                 Preview only (default)
  --live --confirm-live     Enable live path
  --execute                 Run eligible batches after preview (requires live+confirm)
  --batch-size=<n>          Max ${P243_OSBPQ_BATCH_SIZE} (default ${P243_OSBPQ_BATCH_SIZE})
  --force-auto-advance      human_review → auto_advance (live only)
  --force-fresh-reset       Clear stale actionType before scoring (default on for --execute)
  --no-force-fresh-reset    Disable fresh reset
  --confirm "<phrase>"      Default: "${P243_OSBPQ_CONFIRMATION_PHRASE}"
  --xlsx=<path>             Open_Store_Candidate_Matches.xlsx
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
    P243_OSBPQ_BATCH_SIZE,
    readNumberFlag(argv, "batch-size", P243_OSBPQ_BATCH_SIZE),
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
    confirmFlag: confirmFlag ?? (execute ? P243_OSBPQ_CONFIRMATION_PHRASE : null),
  });
  if (autoInjected && confirmationPhrase) {
    console.error(`[p243-osbpq] AUTO-APPLIED confirmation phrase: "${confirmationPhrase}"`);
  } else if (confirmationPhrase) {
    console.error(`[p243-osbpq] Using confirmation phrase: "${confirmationPhrase}"`);
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
    `[p243-osbpq] Starting (dryRun=${dryRun}, execute=${execute}, batchSize=${batchSize}, xlsx=${xlsxPath})…`,
  );

  const result = await runP243OpenStoreBulkPaperworkQueue({
    xlsxPath,
    dryRun,
    confirmLive: !dryRun && confirmLive,
    execute,
    batchSize,
    forceAutoAdvance: forceAutoAdvance && !dryRun && confirmLive,
    forceFreshReset,
    confirmationPhrase: confirmationPhrase ?? P122_CONFIRMATION_PHRASE,
    approveOver60Ids: approveOver60,
  });

  writeArtifact("p243-preview.json", result.preview.report);
  writeArtifact("p243-preview.md", result.preview.markdown);
  writeArtifact("p243-final.json", result.final);
  writeArtifact("p243-final.md", result.finalMarkdown);
  writeArtifact("p243-confirmed-sends.json", result.final.confirmed);
  writeArtifact("p243-deferred.json", result.final.deferred);
  writeArtifact("p243-failures.json", result.final.failures);

  const s = result.final.summary;
  console.log("");
  console.log("P243 Open Store Bulk Paperwork Queue");
  console.log(`  Reviewed:           ${s.reviewed}`);
  console.log(`  Eligible:           ${s.eligible}`);
  console.log(`  Already sent:       ${s.alreadySent}`);
  console.log(`  Already signed:     ${s.alreadySigned}`);
  console.log(`  Duplicates:         ${s.duplicates}`);
  console.log(`  Invalid email:      ${s.invalidEmail}`);
  console.log(`  Blocked:            ${s.blocked}`);
  console.log(`  API remaining:      ${s.apiRemaining ?? "—"}`);
  console.log(`  Safe capacity:      ${s.safeCapacity ?? "—"}`);
  console.log(`  Would send:         ${s.wouldSend}`);
  console.log(`  Attempted:          ${s.attempted}`);
  console.log(`  Confirmed sends:    ${s.confirmedSends}`);
  console.log(`  Deferred:           ${s.deferred}`);
  console.log(`  Failed:             ${s.failed}`);
  console.log(`  Dropbox testMode:   ${result.final.dropboxTestMode}`);
  console.log(`  Live writes:        ${result.final.liveWritesOccurred}`);
  console.log(`  Capacity source:    ${result.final.capacity.source}`);
  if (result.final.stoppedOnSystemFailure) {
    console.log(`  STOPPED: ${result.final.systemStopReason}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
