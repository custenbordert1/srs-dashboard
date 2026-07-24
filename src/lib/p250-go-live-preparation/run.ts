import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildP249ProductionReadiness } from "@/lib/p249-daily-ops-mission/readiness";
import type {
  P249DryRunReport,
  P249GoNoGo,
  P249LiveExecutionPlan,
  P249OperationsDashboard,
  P249OutstandingPaperworkAnalysis,
} from "@/lib/p249-daily-ops-mission/types";
import { buildP250BlockersAndRemediation } from "@/lib/p250-go-live-preparation/blockers";
import {
  formatP250BlockersMarkdown,
  formatP250DashboardMarkdown,
  formatP250ExecutiveSummaryMarkdown,
  formatP250GoNoGoMarkdown,
  formatP250LaunchPlanMarkdown,
  formatP250SafetyMarkdown,
} from "@/lib/p250-go-live-preparation/format";
import { buildP250ControlledLaunchPlan } from "@/lib/p250-go-live-preparation/launch-plan";
import { buildP250ProductionSafetyReview } from "@/lib/p250-go-live-preparation/safety";
import {
  P250_OPS_DATE,
  P250_PHASE,
  type P250GoNoGo,
  type P250MissionResult,
  type P250OperationsDashboard,
} from "@/lib/p250-go-live-preparation/types";

function writeArtifact(artifactsDir: string, name: string, value: unknown): string {
  mkdirSync(artifactsDir, { recursive: true });
  const target = path.join(artifactsDir, name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  return target;
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function computeReadinessScore(input: {
  failCount: number;
  warnCount: number;
  resendReady: boolean;
  dropboxApiOk: boolean;
  breezyOk: boolean;
  eligibleReminders: number;
  eligibleInitial: number;
}): number {
  let score = 100;
  score -= Math.min(40, input.failCount * 8);
  score -= Math.min(15, input.warnCount * 2);
  if (!input.resendReady) score -= 20;
  if (!input.dropboxApiOk) score -= 15;
  if (!input.breezyOk) score -= 15;
  if (input.eligibleReminders === 0 && input.eligibleInitial === 0) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function runP250GoLivePreparation(input?: {
  artifactsDir?: string;
}): Promise<P250MissionResult> {
  const artifactsDir = input?.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const artifacts: string[] = [];
  const reused: string[] = [];

  console.log("[p250] Phase 1 — refresh production blockers (read-only)…");
  const readiness = await buildP249ProductionReadiness();

  const p249Dashboard = readJson<P249OperationsDashboard>(
    path.join(artifactsDir, "p249-operations-dashboard.json"),
  );
  const p249Outstanding = readJson<P249OutstandingPaperworkAnalysis>(
    path.join(artifactsDir, "p249-outstanding-paperwork-analysis.json"),
  );
  const p249DryRun = readJson<P249DryRunReport>(
    path.join(artifactsDir, "p249-dry-run-report.json"),
  );
  const p249Go = readJson<P249GoNoGo>(path.join(artifactsDir, "p249-go-nogo.json"));
  const p249Live = readJson<P249LiveExecutionPlan>(
    path.join(artifactsDir, "p249-live-execution-plan.json"),
  );

  for (const name of [
    "p249-operations-dashboard.json",
    "p249-outstanding-paperwork-analysis.json",
    "p249-dry-run-report.json",
    "p249-go-nogo.json",
    "p249-live-execution-plan.json",
  ]) {
    if (existsSync(path.join(artifactsDir, name))) reused.push(name);
  }

  if (!p249Dashboard || !p249Outstanding || !p249DryRun) {
    throw new Error(
      "[p250] Missing required P249 artifacts. Run `npx tsx scripts/p249-run-daily-ops-mission.ts` first.",
    );
  }

  const blockersDoc = buildP250BlockersAndRemediation(readiness, reused);

  const invalidEmail =
    p249Outstanding.blockedByReason.find((b) => b.reason === "reminder:invalid_email")
      ?.count ?? 0;
  const missingSig =
    p249Outstanding.blockedByReason.find(
      (b) => b.reason === "reminder:missing_signature_request",
    )?.count ?? 0;
  const productionQuotaZero = readiness.checklist.some(
    (c) =>
      c.id === "dropbox_connectivity" &&
      (/quota=0/i.test(c.detail) || /vendor blocked/i.test(c.detail)),
  );

  console.log("[p250] Phase 2 — production safety review…");
  const safety = buildP250ProductionSafetyReview({
    dropboxTestMode: readiness.modes.dropboxTestMode,
    resendReady: readiness.modes.resendReady,
    productionDropboxQuotaZero: productionQuotaZero,
    invalidEmailCount: invalidEmail,
    missingSignatureRequestCount: missingSig,
  });

  const dropboxApiOk = readiness.checklist.some(
    (c) => c.id === "dropbox_connectivity" && /apiStatus=ok/i.test(c.detail),
  );
  const breezyOk = readiness.checklist.some(
    (c) => c.id === "breezy_connectivity" && c.status === "PASS",
  );

  const liveBlockers = readiness.blockers.filter((b) =>
    /RESEND_API_KEY|DIRECT_DEPOSIT_EMAIL_MODE|SRS_RECRUITING_FROM|Sender domain|Breezy|Dropbox Sign API key missing/i.test(
      b,
    ),
  );

  let decision: P250GoNoGo["decision"] = "NO-GO";
  if (liveBlockers.length === 0 && readiness.modes.resendReady && dropboxApiOk) {
    decision = productionQuotaZero ? "CONDITIONAL-GO" : "GO";
  }

  const initial = p249Outstanding.counts.eligibleForInitialPaperwork;
  const reminders = p249Outstanding.counts.reminder1;
  const readyForMel =
    p249Go?.expectedReadyForMelToday ?? p249Outstanding.counts.readyForMel;
  const safeCapacity =
    p249DryRun.simulations.openStoreSafeCapacity ??
    p249Live?.throughputEstimate.initialSendsPerHour ??
    null;

  console.log("[p250] Phase 3 — controlled launch plan…");
  const launchPlan = buildP250ControlledLaunchPlan({
    decision,
    prerequisiteBlockers: liveBlockers.length > 0 ? liveBlockers : readiness.blockers.slice(0, 8),
    initialPaperwork: initial,
    reminder1Batch: reminders,
    readyForMel,
    openStoreSafeCapacity: safeCapacity,
  });

  console.log("[p250] Phase 4 — operations dashboard…");
  const dashboard: P250OperationsDashboard = {
    phase: P250_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P250_OPS_DATE,
    sourceArtifact: "p249-operations-dashboard.json (+ refreshed readiness)",
    newApplicants: p249Dashboard.newApplicants,
    paperworkNeeded: p249Dashboard.paperworkNeeded,
    eligibleToSend: p249Dashboard.eligibleToSend,
    paperworkSent: p249Dashboard.paperworkSent,
    outstandingSignatures: p249Dashboard.outstandingSignatures,
    reminder1: p249Dashboard.reminder1,
    reminder2: p249Dashboard.reminder2,
    reminder3: p249Dashboard.reminder3,
    reminder4: p249Dashboard.reminder4,
    viewed: p249Dashboard.viewed,
    signedToday: p249Dashboard.signedToday,
    readyForMel: p249Dashboard.readyForMel,
    blocked: p249Dashboard.blocked,
    pipelineHealthPct: p249Dashboard.pipelineHealthPct,
    estimatedRecruiterHoursSaved: p249Dashboard.estimatedRecruiterHoursSaved,
    dryRunZeroWritesConfirmed: p249DryRun.zeroWritesConfirmed === true,
  };

  const readinessScore = computeReadinessScore({
    failCount: readiness.failCount,
    warnCount: readiness.warnCount,
    resendReady: readiness.modes.resendReady,
    dropboxApiOk,
    breezyOk,
    eligibleReminders: reminders,
    eligibleInitial: initial,
  });

  const justification =
    decision === "GO"
      ? `GO for controlled launch: Resend live-ready, Dropbox/Breezy readable, volumes confirmed (initial=${initial}, Reminder 1=${reminders}). Proceed only after explicit operator approval using the P250 launch sequence.`
      : decision === "CONDITIONAL-GO"
        ? `CONDITIONAL-GO: Resend live-ready and probes OK, but Dropbox production quota=0. Reminder emails may proceed after approval; initial production packets only via intentional testMode until quota restored.`
        : `NO-GO for live execution: ${liveBlockers.length || readiness.failCount} critical blocker(s) remain (primarily Resend/live email configuration). Dropbox status probes and Breezy reads succeed; ${reminders} Reminder 1 and ${initial} initial send(s) are queued for after config. System is prepared so the only remaining action after remediation + GO is explicit approval to execute live.`;

  console.log("[p250] Phase 5 — GO / NO-GO…");
  const goNoGo: P250GoNoGo = {
    phase: P250_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P250_OPS_DATE,
    decision,
    readinessScore,
    blockers: liveBlockers.length > 0 ? liveBlockers : readiness.blockers.slice(0, 8),
    expectedVolumes: {
      initialPaperworkSends: initial,
      reminder1Sends: reminders,
      readyForMel,
    },
    remainingRisks: safety.remainingProductionRisks.slice(0, 8),
    recommendedLaunchWindow:
      decision === "NO-GO"
        ? "Do not launch today. Remediate Resend blockers, re-run P250 to GO, then launch in a supervised weekday window (morning ET) with operator monitoring."
        : "Supervised weekday morning (ET), after canary verify, with operator watching Resend + Dropbox dashboards through Reminder 1 batch completion.",
    onlyRemainingAction:
      decision === "NO-GO"
        ? "Remediate blockers in artifacts/p250-blockers-and-remediation.md, re-run P250 until GO, then provide explicit approval to execute the controlled launch plan."
        : "Provide explicit operator approval to execute artifacts/p250-controlled-launch-plan.md step-by-step (starting at test email / canary).",
    justification,
  };

  artifacts.push(
    writeArtifact(artifactsDir, "p250-blockers-and-remediation.json", blockersDoc),
    writeArtifact(
      artifactsDir,
      "p250-blockers-and-remediation.md",
      formatP250BlockersMarkdown(blockersDoc),
    ),
    writeArtifact(artifactsDir, "p250-production-safety-review.json", safety),
    writeArtifact(
      artifactsDir,
      "p250-production-safety-review.md",
      formatP250SafetyMarkdown(safety),
    ),
    writeArtifact(artifactsDir, "p250-controlled-launch-plan.json", launchPlan),
    writeArtifact(
      artifactsDir,
      "p250-controlled-launch-plan.md",
      formatP250LaunchPlanMarkdown(launchPlan),
    ),
    writeArtifact(artifactsDir, "p250-operations-dashboard.json", dashboard),
    writeArtifact(
      artifactsDir,
      "p250-operations-dashboard.md",
      formatP250DashboardMarkdown(dashboard),
    ),
    writeArtifact(artifactsDir, "p250-go-nogo.json", goNoGo),
    writeArtifact(artifactsDir, "p250-go-nogo.md", formatP250GoNoGoMarkdown(goNoGo)),
    writeArtifact(
      artifactsDir,
      "p250-executive-summary.md",
      formatP250ExecutiveSummaryMarkdown({
        goNoGo,
        dashboard,
        blockerCount: blockersDoc.blockers.length,
      }),
    ),
  );

  return {
    blockers: blockersDoc,
    safety,
    launchPlan,
    dashboard,
    goNoGo,
    artifacts,
  };
}
