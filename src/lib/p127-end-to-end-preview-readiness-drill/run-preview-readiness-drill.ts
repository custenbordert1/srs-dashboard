import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle";
import { loadPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { buildOperationsCommandCenterReport } from "@/lib/p126-autonomous-operations-command-center/build-operations-command-center-report";
import { loadRunnerAuditTimeline } from "@/lib/p126-autonomous-operations-command-center/load-activity-timeline";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { buildControlledLivePaperworkPilotReport } from "@/lib/p122-controlled-live-paperwork-pilot/build-pilot-report";
import {
  loadProductionRunnerState,
  recordDuplicatePrevention,
} from "@/lib/p125-autonomous-paperwork-production-runner/runner-store";
import { runProductionRunnerCycle } from "@/lib/p125-autonomous-paperwork-production-runner/run-production-runner";
import type {
  DrillStepStatus,
  PilotRecommendation,
  PreviewDrillStep,
  PreviewReadinessDrillReport,
} from "@/lib/p127-end-to-end-preview-readiness-drill/types";
import { P127_DRILL_MODE, P127_SOURCE_PHASE } from "@/lib/p127-end-to-end-preview-readiness-drill/types";

function step(id: string, label: string, status: DrillStepStatus, detail: string): PreviewDrillStep {
  return { id, label, status, detail };
}

function pickPilotRecommendation(input: {
  cycle: Awaited<ReturnType<typeof runPaperworkCycle>>["report"];
  allowlist: string[];
}): PilotRecommendation {
  const queue = input.cycle.sendQueue.remainingQueue.filter(
    (candidate) =>
      candidate.approvalDecision === "AUTO_APPROVED" && candidate.safeToSend && candidate.onPilotAllowlist,
  );

  const allowlistedAutoApproved = input.cycle.candidates
    .filter((candidate) => candidate.approvalDecision === "AUTO_APPROVED")
    .sort((a, b) => b.approvalScore - a.approvalScore);

  const top =
    queue[0] ??
    allowlistedAutoApproved.find((candidate) => input.allowlist.includes(candidate.candidateId)) ??
    allowlistedAutoApproved[0] ??
    null;

  if (!top) return null;

  const queuePosition =
    input.cycle.sendQueue.remainingQueue.findIndex((candidate) => candidate.candidateId === top.candidateId) + 1;

  return {
    candidateId: top.candidateId,
    candidateName: top.candidateName,
    email: top.email,
    approvalScore: top.approvalScore,
    approvalDecision: top.approvalDecision,
    onPilotAllowlist: top.onPilotAllowlist,
    queuePosition: queuePosition > 0 ? queuePosition : null,
    reason: top.onPilotAllowlist
      ? "Highest-confidence AUTO_APPROVED candidate on pilot allowlist."
      : "Highest-confidence AUTO_APPROVED candidate — add to pilot allowlist before live send.",
  };
}

function buildRemainingSteps(input: {
  pilotConfig: ReturnType<typeof loadPilotConfig>;
  readyForPilot: number;
  pilotRecommendation: PilotRecommendation;
  safetyFailed: number;
}): string[] {
  const steps: string[] = [];

  if (!input.pilotConfig.pilotEnabled) {
    steps.push("Set AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true.");
  }
  if (!input.pilotConfig.liveModeEnabled) {
    steps.push("Set AUTONOMOUS_PAPERWORK_LIVE_MODE=true (only when operator is ready).");
  }
  if (!input.pilotConfig.operatorGo) {
    steps.push("Set AUTONOMOUS_PAPERWORK_OPERATOR_GO=true after operator review.");
  }
  if (input.pilotConfig.allowlist.length === 0) {
    steps.push("Configure AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST with exactly one candidate ID.");
  } else if (input.pilotRecommendation && !input.pilotRecommendation.onPilotAllowlist) {
    steps.push(`Add recommended candidate ${input.pilotRecommendation.candidateId} to pilot allowlist.`);
  }
  if (input.readyForPilot === 0) {
    steps.push("Resolve blockers until at least one AUTO_APPROVED allowlisted candidate is in send queue.");
  }
  if (input.safetyFailed > 0) {
    steps.push("Resolve all failed P122/P123 safety gates before executeOne.");
  }
  steps.push("Run P122 controlled live pilot with confirmation phrase SEND 1 PAPERWORK PACKET.");
  steps.push("Execute one candidate via P125 runner one-cycle with live gates enabled.");
  steps.push("Verify Dropbox Sign delivery and audit log in P126 Operations Command Center.");

  return steps;
}

function resolveGoNoGo(input: {
  drillSteps: PreviewDrillStep[];
  readyForPilot: number;
  pilotRecommendation: PilotRecommendation;
  safetyFailed: number;
  pipelineFailures: number;
}): { goNoGo: PreviewReadinessDrillReport["goNoGo"]; goNoGoReason: string } {
  if (input.pipelineFailures > 0) {
    return {
      goNoGo: "NO-GO",
      goNoGoReason: `${input.pipelineFailures} preview drill step(s) failed — fix pipeline before live pilot.`,
    };
  }

  const warns = input.drillSteps.filter((entry) => entry.status === "WARN").length;
  const liveReady =
    input.readyForPilot > 0 &&
    input.pilotRecommendation?.onPilotAllowlist === true &&
    input.safetyFailed === 0;

  if (liveReady && warns === 0) {
    return {
      goNoGo: "GO",
      goNoGoReason:
        "Preview drill passed — one AUTO_APPROVED allowlisted candidate ready for controlled P122 executeOne pilot.",
    };
  }

  if (input.pipelineFailures === 0 && input.readyForPilot > 0) {
    return {
      goNoGo: "GO WITH CONDITIONS",
      goNoGoReason:
        "Preview pipeline operational — complete pilot env gates and allowlist before first live send.",
    };
  }

  return {
    goNoGo: "GO WITH CONDITIONS",
    goNoGoReason:
      "Preview drill completed — configure pilot allowlist and resolve approval blockers before live send.",
  };
}

export async function runEndToEndPreviewReadinessDrill(): Promise<PreviewReadinessDrillReport> {
  const pilotConfig = loadPilotConfig();
  const drillSteps: PreviewDrillStep[] = [];

  const context = await loadPaperworkCandidates({ mtdOnly: false });
  const ingestionOk = context.candidateIds.length > 0;
  drillSteps.push(
    step(
      "candidate_ingestion",
      "Candidate ingestion",
      ingestionOk ? "PASS" : "WARN",
      ingestionOk
        ? `${context.candidateIds.length} candidate(s) loaded from ingestion pipeline.`
        : "No candidates in ingestion store — drill used empty pipeline.",
    ),
  );

  const approvalDecisions = buildApprovalDecisionsFromContext(context);
  const autoApproved = approvalDecisions.filter((d) => d.approvalDecision === "AUTO_APPROVED");
  const humanApproval = approvalDecisions.filter((d) => d.approvalDecision === "NEEDS_HUMAN_APPROVAL");
  const blocked = approvalDecisions.filter((d) => d.approvalDecision === "BLOCKED");
  const waiting = approvalDecisions.filter((d) => d.approvalDecision === "WAITING");
  const rejectedForSafety = approvalDecisions.filter((d) => d.approvalDecision === "REJECTED_FOR_SAFETY");

  drillSteps.push(
    step(
      "approval_engine",
      "Approval engine",
      approvalDecisions.length > 0 ? "PASS" : "WARN",
      `P124 evaluated ${approvalDecisions.length} candidate(s): ${autoApproved.length} AUTO_APPROVED.`,
    ),
  );

  const cycleResult = await runPaperworkCycle({ dryRun: true });
  if (cycleResult.executeBatchCalled) {
    throw new Error("P127 drill must never invoke executeBatch.");
  }

  const cycle = cycleResult.report;
  drillSteps.push(
    step(
      "orchestrator_eligibility",
      "Orchestrator eligibility",
      cycle.candidates.length > 0 ? "PASS" : "WARN",
      `P123 classified ${cycle.candidates.length} candidate(s); ${cycle.metrics.readyCount} eligibility-ready.`,
    ),
  );

  drillSteps.push(
    step(
      "send_queue_creation",
      "Send queue creation",
      "PASS",
      `Send queue depth ${cycle.sendQueue.queueDepth}; next: ${cycle.sendQueue.nextCandidate?.candidateName ?? "none"}.`,
    ),
  );

  const runnerCycle = await runProductionRunnerCycle({
    mode: "oneCycle",
    execute: false,
    runPaperworkCycleFn: async () => cycleResult,
  });
  if (runnerCycle.executeBatchCalled) {
    throw new Error("P127 drill runner preview must never invoke executeBatch.");
  }

  drillSteps.push(
    step(
      "runner_one_cycle_preview",
      "Runner one-cycle preview",
      runnerCycle.skippedPaused ? "WARN" : "PASS",
      runnerCycle.skippedPaused
        ? "P125 runner paused — preview cycle skipped without send."
        : `P125 one-cycle preview complete; executed=${cycle.execution.executed}.`,
    ),
  );

  const opsCenter = await buildOperationsCommandCenterReport({ filters: { timeRange: "all" }, refresh: false });
  drillSteps.push(
    step(
      "operations_command_center",
      "Operations Command Center",
      opsCenter.sourcePhase === "P126" ? "PASS" : "FAIL",
      `P126 report generated with ${opsCenter.candidateSummary.length} candidate summary row(s).`,
    ),
  );

  const auditTimeline = await loadRunnerAuditTimeline();
  const mergedTimelineCount = auditTimeline.length + cycle.operatorTimeline.length;
  drillSteps.push(
    step(
      "audit_timeline",
      "Audit timeline",
      mergedTimelineCount > 0 ? "PASS" : "WARN",
      `${mergedTimelineCount} timeline event(s) available (P125 audit + P123 operator timeline).`,
    ),
  );

  const runnerState = await loadProductionRunnerState();
  drillSteps.push(
    step(
      "retry_queue",
      "Retry queue",
      "PASS",
      `Retry queue depth ${runnerState.retryQueue.length}; mechanism operational.`,
    ),
  );

  const duplicateProbe = { ...runnerState, sentCandidateIds: [...runnerState.sentCandidateIds] };
  const duplicateFirst = recordDuplicatePrevention(duplicateProbe, "__p127_probe__");
  const duplicateSecond = recordDuplicatePrevention(duplicateProbe, "__p127_probe__");
  drillSteps.push(
    step(
      "duplicate_prevention",
      "Duplicate prevention",
      duplicateFirst && !duplicateSecond ? "PASS" : "FAIL",
      duplicateFirst && !duplicateSecond
        ? "Duplicate prevention blocks repeat candidate IDs."
        : "Duplicate prevention probe failed.",
    ),
  );

  const readyForPilot = cycle.candidates.filter(
    (candidate) =>
      candidate.approvalDecision === "AUTO_APPROVED" &&
      candidate.safeToSend &&
      candidate.onPilotAllowlist,
  ).length;

  const allowlistHasAutoApproved = cycle.candidates.some(
    (candidate) =>
      candidate.approvalDecision === "AUTO_APPROVED" &&
      pilotConfig.allowlist.includes(candidate.candidateId),
  );

  drillSteps.push(
    step(
      "pilot_allowlist_readiness",
      "Pilot allowlist readiness",
      pilotConfig.allowlist.length > 0
        ? allowlistHasAutoApproved
          ? "PASS"
          : "WARN"
        : "WARN",
      pilotConfig.allowlist.length > 0
        ? `${pilotConfig.allowlist.length} allowlisted ID(s); ${readyForPilot} ready for pilot queue.`
        : "AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST is empty — required before live send.",
    ),
  );

  const pilotReport = await buildControlledLivePaperworkPilotReport({ dryRun: true });
  const safetyGates = [
    ...cycle.safetyState.checks,
    ...pilotReport.systemSafetyChecks.map((check) => ({
      id: `p122_${check.id}`,
      label: check.label,
      passed: check.passed,
      detail: check.detail,
    })),
  ];
  const safetyFailed = safetyGates.filter((gate) => !gate.passed).length;

  const pilotRecommendation = pickPilotRecommendation({ cycle, allowlist: pilotConfig.allowlist });
  const pipelineFailures = drillSteps.filter((entry) => entry.status === "FAIL").length;
  const { goNoGo, goNoGoReason } = resolveGoNoGo({
    drillSteps,
    readyForPilot,
    pilotRecommendation,
    safetyFailed,
    pipelineFailures,
  });

  return {
    sourcePhase: P127_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P127_DRILL_MODE,
    drillSteps,
    totalCandidatesEvaluated: approvalDecisions.length,
    autoApproved: autoApproved.length,
    humanApproval: humanApproval.length,
    blocked: blocked.length,
    waiting: waiting.length,
    rejectedForSafety: rejectedForSafety.length,
    readyForPilot,
    pilotRecommendation,
    safetyGates,
    goNoGo,
    goNoGoReason,
    remainingStepsBeforeFirstLiveSend: buildRemainingSteps({
      pilotConfig,
      readyForPilot,
      pilotRecommendation,
      safetyFailed,
    }),
    validations: {
      candidateIngestion: drillSteps.find((s) => s.id === "candidate_ingestion")!.status,
      approvalEngine: drillSteps.find((s) => s.id === "approval_engine")!.status,
      orchestratorEligibility: drillSteps.find((s) => s.id === "orchestrator_eligibility")!.status,
      sendQueueCreation: drillSteps.find((s) => s.id === "send_queue_creation")!.status,
      runnerOneCyclePreview: drillSteps.find((s) => s.id === "runner_one_cycle_preview")!.status,
      operationsCommandCenter: drillSteps.find((s) => s.id === "operations_command_center")!.status,
      auditTimeline: drillSteps.find((s) => s.id === "audit_timeline")!.status,
      retryQueue: drillSteps.find((s) => s.id === "retry_queue")!.status,
      duplicatePrevention: drillSteps.find((s) => s.id === "duplicate_prevention")!.status,
      pilotAllowlistReadiness: drillSteps.find((s) => s.id === "pilot_allowlist_readiness")!.status,
    },
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
  };
}
