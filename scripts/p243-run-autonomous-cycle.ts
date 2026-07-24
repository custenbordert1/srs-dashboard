/**
 * P243 — Run end-to-end autonomous recruiting cycle (dry-run by default).
 *
 *   node --import tsx scripts/p243-run-autonomous-cycle.ts
 *   node --import tsx scripts/p243-run-autonomous-cycle.ts --limit=10
 *   node --import tsx scripts/p243-run-autonomous-cycle.ts --force-fresh-reset
 *   node --import tsx scripts/p243-run-autonomous-cycle.ts --live --confirm-live --canary-limit=3
 *   node --import tsx scripts/p243-run-autonomous-cycle.ts --live --confirm-live --full-live
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runAutonomousRecruitingCycle } from "@/lib/autonomous-recruiting-pipeline";

function readNumberFlag(argv: string[], name: string, fallback: number): number {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return Math.max(1, Number(inline.slice(`--${name}=`.length)) || fallback);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0) return Math.max(1, Number(argv[idx + 1]) || fallback);
  return fallback;
}

function modeLabel(dryRun: boolean, executionMode: string): string {
  if (dryRun || executionMode === "dry_run") return "DRY-RUN";
  if (executionMode === "full_live") return "FULL-LIVE";
  return "CANARY-LIVE";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limit = readNumberFlag(argv, "limit", 25);
  const canaryLimit = readNumberFlag(argv, "canary-limit", 3);
  const live = argv.includes("--live") || argv.includes("--dry-run=false");
  const confirmLive = argv.includes("--confirm-live") || argv.includes("--confirmLive");
  const fullLive = argv.includes("--full-live") || argv.includes("--fullLive");
  const useLLMEnhancement = argv.includes("--llm");
  const forceFreshReset =
    argv.includes("--force-fresh-reset") ||
    argv.includes("--forceFreshReset") ||
    argv.includes("--force-fresh-data") ||
    argv.includes("--forceFreshData");

  if (live && !confirmLive) {
    console.error("[P243] Live mode requires --confirm-live (refusing to start).");
    process.exit(2);
  }
  if (fullLive && !live) {
    console.error("[P243] --full-live requires --live --confirm-live.");
    process.exit(2);
  }

  const report = await runAutonomousRecruitingCycle({
    dryRun: !live,
    confirmLive: live ? confirmLive : false,
    fullLive: live && fullLive,
    canaryLimit,
    limit,
    useLLMEnhancement,
    forceFreshReset,
  });

  mkdirSync("artifacts", { recursive: true });
  const out = path.join("artifacts", "p243-autonomous-cycle-report.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  const mode = modeLabel(report.dryRun, report.executionMode);
  console.log(`[P243] mode=${mode} executionMode=${report.executionMode} dryRun=${report.dryRun}`);
  console.log(
    `[P243] pulled=${report.pulled} scored=${report.scored} advance=${report.autoAdvance} review=${report.humanReview} reject=${report.autoReject}`,
  );
  console.log(
    `[P243] planned=${report.paperworkPlanned} sent=${report.paperworkSent} failures=${report.failures} successRate=${report.successRatePct}% advanceRate=${report.advanceRatePct}%`,
  );
  console.log(`[P243] Fresh Reset Applied=${report.freshResetApplied}`);
  console.log(
    `[P243] skipped: idempotent=${report.skippedIdempotent} alreadySent=${report.skippedAlreadySent} stateMachine=${report.skippedStateMachine} canary=${report.skippedCanaryCap}`,
  );
  console.log(
    `[P243] ingestion=${report.ingestion.source} webhookHits=${report.ingestion.webhookHits} pollHits=${report.ingestion.pollHits} deduped=${report.ingestion.deduped}`,
  );
  if (report.warnings.length) {
    console.log(`[P243] warnings (${report.warnings.length}):`);
    for (const w of report.warnings) console.log(`  - ${w}`);
  }
  const preflightFail = report.preflight.filter((c) => !c.ok);
  if (preflightFail.length) {
    console.log(`[P243] preflight blockers:`);
    for (const c of preflightFail) console.log(`  - [${c.id}] ${c.message}`);
  }
  console.log(`[P243] trace=${report.ceoTraceId} batch=${report.batchId}`);
  console.log(`[P243] audit=${report.auditTraceLinks.evaluationPreviewPath}`);
  console.log(`[P243] artifact=${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
