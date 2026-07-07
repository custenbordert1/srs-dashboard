/**
 * P154.3 — Morning production paperwork send cycle
 *
 * Usage: npx tsx scripts/p154.3-morning-production-send-cycle.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { runCandidateIngestionSync } from "@/lib/candidate-ingestion/run-ingestion-sync";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import {
  executeControlledProductionAutopilot,
  getP154MaxAssignmentsPerCycle,
  getP154MaxSendsPerCycle,
  loadAutopilotState,
  verifyAutopilotSystemHealth,
} from "@/lib/p154-controlled-production-autopilot-activation";

const SESSION = {
  userId: "p154.3-morning-cycle",
  email: "p154.3@local",
  name: "P154.3 Morning Production Send",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

/** Yesterday's P154 live cycle (2026-07-06 UTC). */
const YESTERDAY_CYCLE_START = "2026-07-06T20:50:00.000Z";

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

function isActiveSignature(workflow: CandidateWorkflowRecord): boolean {
  return Boolean(
    workflow.signatureRequestId &&
      (workflow.paperworkStatus === "sent" ||
        workflow.paperworkStatus === "viewed" ||
        workflow.workflowStatus === "Paperwork Sent"),
  );
}

function isSigned(workflow: CandidateWorkflowRecord): boolean {
  return workflow.paperworkStatus === "signed" || workflow.workflowStatus === "Signed";
}

async function auditYesterdayPackets(onboardingByCandidate: Map<string, CandidateOnboardingRecord>) {
  const bundle = await getCandidateWorkflowBundle();
  const audit = await loadPaperworkAutomationAuditLog();

  const yesterdaySends = audit.filter(
    (e) =>
      e.sendResult === "sent" &&
      e.executed === true &&
      Date.parse(e.at) >= Date.parse(YESTERDAY_CYCLE_START),
  );

  let activeSignatures = 0;
  let completedSignatures = 0;
  const duplicateChecks: Array<{
    candidateId: string;
    candidateName: string | null;
    wouldBlock: boolean;
    reason: string | null;
    paperworkStatus: string;
    signatureRequestId: string | null;
  }> = [];

  for (const record of Object.values(bundle.workflows)) {
    if (isActiveSignature(record)) activeSignatures += 1;
    if (isSigned(record)) completedSignatures += 1;
  }

  for (const event of yesterdaySends) {
    const workflow = bundle.workflows[event.candidateId];
    const onboarding = onboardingByCandidate.get(event.candidateId) ?? null;
    const reason = duplicatePaperworkSendBlockReason({
      workflow: workflow ?? undefined,
      activeOnboarding: onboarding ?? undefined,
    });
    duplicateChecks.push({
      candidateId: event.candidateId,
      candidateName: event.candidateName ?? null,
      wouldBlock: reason !== null,
      reason,
      paperworkStatus: workflow?.paperworkStatus ?? "unknown",
      signatureRequestId: workflow?.signatureRequestId ?? onboarding?.signatureRequestId ?? null,
    });
  }

  return {
    yesterdaySendCount: yesterdaySends.length,
    yesterdaySendEvents: yesterdaySends.map((e) => ({
      candidateId: e.candidateId,
      candidateName: e.candidateName,
      at: e.at,
      signatureRequestId: (e as { signatureRequestId?: string }).signatureRequestId ?? null,
    })),
    activeSignatures,
    completedSignatures,
    duplicateChecks,
    allYesterdayWouldBeBlocked: duplicateChecks.every((c) => c.wouldBlock),
  };
}

function formatMarkdown(report: Record<string, unknown>): string {
  const health = report.health as { overallStatus: string; healthy: boolean };
  const pre = report.preSendAudit as Record<string, unknown>;
  const cycle = report.cycle as Record<string, number | boolean | string>;
  const ingestion = report.ingestion as { ok: boolean; totalCandidates?: number };
  const lines = [
    "# P154.3 — Morning Production Paperwork Send Cycle",
    "",
    `Generated: ${report.generatedAt}`,
    "Manual controlled cycle — scheduler not running.",
    "",
    "## System health",
    "",
    `Overall: **${health.overallStatus}** (${health.healthy ? "PASS" : "FAIL"})`,
    "",
    "## Ingestion refresh",
    "",
    `- Sync ok: **${ingestion.ok}**`,
    `- Total candidates in store: **${ingestion.totalCandidates ?? "—"}**`,
    "",
    "## Pre-send audit (yesterday's packets)",
    "",
    `- Yesterday sends (audit): **${pre.yesterdaySendCount}**`,
    `- Active signature requests (workflow): **${pre.activeSignatures}**`,
    `- Completed signatures (workflow): **${pre.completedSignatures}**`,
    `- All yesterday sends would be duplicate-blocked: **${pre.allYesterdayWouldBeBlocked}**`,
    "",
    "## Cycle results",
    "",
    `- Candidates evaluated: **${cycle.candidatesEvaluated}**`,
    `- Recruiters assigned: **${cycle.recruitersAssigned}**`,
    `- Paperwork sent: **${cycle.paperworkSent}**`,
    `- Paperwork skipped: **${cycle.paperworkSkipped}**`,
    `- Duplicates prevented: **${cycle.duplicatesPrevented}**`,
    `- Active signatures detected: **${pre.activeSignatures}**`,
    `- Completed signatures detected: **${pre.completedSignatures}**`,
    `- Failures: **${cycle.failures}**`,
    `- Queue remaining: **${cycle.queueRemaining}**`,
    `- Execution time: **${cycle.executionTimeMs}ms**`,
    "",
    "## Safety",
    "",
    "- Max assignments: 25",
    "- Max sends: 10",
    "- Stop on first error: yes",
    "- Breezy writes: no",
    "- Duplicate prevention: active",
    "",
    "## Rollback",
    "",
    String(report.rollbackRecommendation ?? "—"),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnvLocal();
  const generatedAt = new Date().toISOString();

  process.env.P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED = "true";
  process.env.P151_AUTONOMOUS_ADVANCEMENT_ENABLED = "true";
  process.env.P152_IMMEDIATE_PAPERWORK_ENABLED = "true";
  process.env.P154_MAX_RECRUITER_ASSIGNMENTS_PER_CYCLE = String(getP154MaxAssignmentsPerCycle());
  process.env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE = String(getP154MaxSendsPerCycle());
  process.env.P151_MAX_ASSIGNMENTS_PER_CYCLE = String(getP154MaxAssignmentsPerCycle());
  process.env.P152_MAX_SENDS_PER_CYCLE = String(getP154MaxSendsPerCycle());

  console.error("[P154.3] Phase 1 — system health…");
  const health = await verifyAutopilotSystemHealth();
  if (!health.healthy) {
    console.error(`[P154.3] Health check failed: ${health.abortReason}`);
    process.exit(1);
  }

  console.error("[P154.3] Phase 2 — refresh live ingestion…");
  const ingestion = await runCandidateIngestionSync({
    byUserId: SESSION.userId,
    runPipeline: true,
    enrichQuestionnaires: true,
  });

  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));

  console.error("[P154.3] Phase 3 — pre-send audit (yesterday packets)…");
  const preSendAudit = await auditYesterdayPackets(onboardingByCandidate);

  console.error("[P154.3] Phase 4 — controlled live production cycle…");
  const cycleReport = await executeControlledProductionAutopilot({
    session: SESSION,
    dryRun: false,
    userId: SESSION.userId,
  });

  const autopilotState = await loadAutopilotState();

  const report = {
    sourcePhase: "P154.3",
    generatedAt,
    health,
    ingestion: {
      ok: ingestion.ok,
      totalCandidates: ingestion.ok ? ingestion.totalCandidates : null,
      newCandidates: ingestion.ok ? ingestion.newCandidates : null,
      positionsScannedThisRun: ingestion.ok ? ingestion.positionsScannedThisRun : null,
      cycleComplete: ingestion.ok ? ingestion.cycleComplete : null,
      error: ingestion.ok ? null : ingestion.error,
    },
    preSendAudit,
    cycle: {
      dryRun: cycleReport.dryRun,
      autopilotEnabled: cycleReport.autopilotEnabled,
      paused: cycleReport.paused,
      candidatesEvaluated: cycleReport.cycle.candidatesEvaluated,
      recruitersAssigned: cycleReport.cycle.recruitersAssigned,
      paperworkSent: cycleReport.cycle.paperworkSent,
      paperworkSkipped: cycleReport.cycle.paperworkSkipped,
      duplicatesPrevented: cycleReport.cycle.duplicatesPrevented,
      failures: cycleReport.cycle.failures,
      queueRemaining: cycleReport.cycle.queueRemaining,
      executionTimeMs: cycleReport.cycle.executionTimeMs,
      stoppedOnError: cycleReport.cycle.stoppedOnError,
      capReachedAssignments: cycleReport.cycle.capReachedAssignments,
      capReachedSends: cycleReport.cycle.capReachedSends,
    },
    dashboard: cycleReport.dashboard,
    rollbackRecommendation: cycleReport.rollbackRecommendation,
    autopilotState,
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p154.3-morning-production-send-cycle.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p154.3-morning-production-send-cycle.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: cycleReport.cycle.failures === 0 && !cycleReport.cycle.stoppedOnError,
        jsonPath,
        mdPath,
        preSendAudit: {
          yesterdaySendCount: preSendAudit.yesterdaySendCount,
          activeSignatures: preSendAudit.activeSignatures,
          completedSignatures: preSendAudit.completedSignatures,
          allYesterdayWouldBeBlocked: preSendAudit.allYesterdayWouldBeBlocked,
        },
        cycle: report.cycle,
      },
      null,
      2,
    ),
  );

  if (cycleReport.cycle.failures > 0 || cycleReport.cycle.stoppedOnError) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
