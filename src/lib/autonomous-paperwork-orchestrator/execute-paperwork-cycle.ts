import { randomUUID } from "node:crypto";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { evaluateEligibilityForCandidates } from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { evaluateOrchestratorApproval } from "@/lib/autonomous-paperwork-orchestrator/evaluate-approvals";
import { buildApprovalSummary } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { evaluateOrchestratorSafety } from "@/lib/autonomous-paperwork-orchestrator/evaluate-safety";
import { buildOrchestratorCandidateRecord, buildSendQueue } from "@/lib/autonomous-paperwork-orchestrator/build-send-queue";
import { createOperatorTimeline } from "@/lib/autonomous-paperwork-orchestrator/operator-timeline";
import { shouldRetryPaperworkSend } from "@/lib/autonomous-paperwork-orchestrator/retry-engine";
import { savePaperworkCycleMonitorState } from "@/lib/autonomous-paperwork-orchestrator/cycle-store";
import { buildPaperworkCycleReport } from "@/lib/autonomous-paperwork-orchestrator/build-cycle-report";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { runControlledLivePaperworkPilot } from "@/lib/p122-controlled-live-paperwork-pilot/run-controlled-live-pilot";
import type { PaperworkCycleReport } from "@/lib/autonomous-paperwork-orchestrator/types";

export type RunPaperworkCycleInput = {
  dryRun?: boolean;
  execute?: boolean;
  confirmationPhrase?: string;
  candidateId?: string;
  cycleId?: string;
  byUserId?: string;
  /**
   * When true with execute+candidateId, allow P122 send if system/candidate
   * safetyChecks pass even when status is not ready_to_send (e.g. call_first).
   * Used by P243 forceAutoAdvance.
   */
  forceReadyToSend?: boolean;
  runPilotSend?: typeof runControlledLivePaperworkPilot;
  loadCandidates?: typeof loadPaperworkCandidates;
  contextOverride?: LoadedPaperworkCandidates;
};

export type RunPaperworkCycleResult = {
  report: PaperworkCycleReport;
  executeBatchCalled: false;
};

export async function runPaperworkCycle(input: RunPaperworkCycleInput = {}): Promise<RunPaperworkCycleResult> {
  const dryRun = input.execute !== true;
  const cycleId = input.cycleId ?? randomUUID();
  const timeline = createOperatorTimeline();
  const warnings: string[] = [
    "P123 — autonomous paperwork orchestrator (executeOne only).",
    "P123 — executeBatch is never used.",
    "P123 — P122 safety gates remain enforced.",
    "P124 — only AUTO_APPROVED candidates enter send queue.",
  ];
  const errors: string[] = [];
  const pilotConfig = loadPilotConfig();
  // Live execute requires the canonical phrase for P122 safety; default when executing.
  const confirmationPhrase = !dryRun
    ? (input.confirmationPhrase?.trim() || P122_CONFIRMATION_PHRASE)
    : input.confirmationPhrase?.trim() || undefined;

  timeline.add("Queue built", "Loading candidate ready queue");
  const context =
    input.contextOverride ??
    (await (input.loadCandidates ?? loadPaperworkCandidates)({ mtdOnly: false }));

  timeline.add("Candidate evaluated", `${context.candidateIds.length} candidate(s) loaded`);
  const eligibility = evaluateEligibilityForCandidates({
    context,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
  });

  const approvals = eligibility.map((entry) => {
    const row = entry.row;
    const candidateName = row
      ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || entry.candidateId
      : entry.candidateId;
    return evaluateOrchestratorApproval({
      context,
      candidateId: entry.candidateId,
      candidateName,
      eligibilityStatus: entry.status,
      templateKey: entry.templateKey,
      mappingConfidence: entry.mappingConfidence,
      approvedMappingReady: entry.approvedMappingReady,
      onPilotAllowlist: pilotConfig.allowlist.includes(entry.candidateId),
      row,
    });
  });

  const candidates = eligibility.map((entry, index) => {
    const row = entry.row;
    const candidateName = row
      ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || entry.candidateId
      : entry.candidateId;
    const approval = approvals[index]!;
    return buildOrchestratorCandidateRecord({
      candidateId: entry.candidateId,
      candidateName,
      email: row?.email?.trim() ?? "",
      positionId: row?.positionId ?? null,
      positionTitle: row?.positionName ?? null,
      recruiter: row?.assignedRecruiter ?? null,
      dm: row?.assignedDM ?? null,
      eligibilityStatus: entry.status,
      requiredAction: entry.requiredAction,
      blockingReasons: [...entry.blockingReasons, ...approval.approval.blockingReasons],
      templateKey: entry.templateKey,
      mappingConfidence: entry.mappingConfidence,
      approvedMappingReady: entry.approvedMappingReady,
      onPilotAllowlist: pilotConfig.allowlist.includes(entry.candidateId),
      approvedForQueue: approval.approvedForQueue,
      approvalDecision: approval.approval.approvalDecision,
      approvalScore: approval.approval.approvalScore,
      createdAt: row?.createdDate ?? null,
    });
  });

  const approvalSummary = buildApprovalSummary(approvals.map((entry) => entry.approval));

  timeline.add("Approval verified", "Approval decisions evaluated for queue");
  const sendQueue = buildSendQueue(candidates);
  const safetyState = await evaluateOrchestratorSafety({
    dryRun,
    confirmationPhrase,
    context,
    candidates,
  });

  const target =
    (input.candidateId
      ? sendQueue.remainingQueue.find((candidate) => candidate.candidateId === input.candidateId)
      : sendQueue.nextCandidate) ?? null;

  // P243 (and similar callers) may request execute for a specific candidateId after
  // their own advance/canary decision. Do not require P124 AUTO_APPROVED queue
  // membership in that case — P122 pilot gates still enforce the live send.
  const executeCandidateId =
    !dryRun && safetyState.goNoGo === "GO"
      ? (target?.candidateId ?? input.candidateId ?? null)
      : null;
  const executeCandidateName =
    target?.candidateName ??
    candidates.find((c) => c.candidateId === executeCandidateId)?.candidateName ??
    executeCandidateId ??
    "unknown";
  const executeEligibility =
    target?.eligibilityStatus ??
    candidates.find((c) => c.candidateId === executeCandidateId)?.eligibilityStatus ??
    "READY_TO_SEND";

  let execution: PaperworkCycleReport["execution"] = {
    executed: false,
    mode: dryRun ? "dryRun" : "none",
    candidateId: executeCandidateId ?? target?.candidateId ?? input.candidateId ?? null,
    outcome: "not_executed",
    signatureRequestId: null,
    error: dryRun ? "dryRun default — no send executed." : null,
    retryAttempt: 0,
    executeBatchCalled: false,
  };

  if (!dryRun && executeCandidateId) {
    if (!target && input.candidateId) {
      timeline.add(
        "executeOne started",
        `${executeCandidateName} (explicit candidateId; not in AUTO_APPROVED queue)`,
      );
      warnings.push(
        `P123: executing explicit candidateId ${executeCandidateId} outside AUTO_APPROVED queue; P122 pilot gates still apply.`,
      );
    } else {
      timeline.add("executeOne started", executeCandidateName);
    }
    const runPilot = input.runPilotSend ?? runControlledLivePaperworkPilot;
    let attempt = 0;
    let sendError: string | null = null;

    while (attempt < 3) {
      const pilotResult = await runPilot({
        dryRun: false,
        confirmationPhrase,
        candidateId: executeCandidateId,
        byUserId: input.byUserId ?? "p123-paperwork-orchestrator",
        forceReadyToSend: input.forceReadyToSend === true,
      });

      const sent = pilotResult.sendResult.outcome === "sent";
      execution = {
        executed: sent,
        mode: pilotResult.executedMode,
        candidateId: executeCandidateId,
        outcome: pilotResult.sendResult.outcome,
        signatureRequestId: pilotResult.sendResult.signatureRequestId,
        error: pilotResult.sendResult.error,
        retryAttempt: attempt,
        executeBatchCalled: false,
      };

      if (sent) {
        timeline.add("Dropbox request created", pilotResult.sendResult.signatureRequestId ?? "pending");
        timeline.add("Audit written", "P100 audit + pilot registry updated");
        timeline.add("Success", `${executeCandidateName} paperwork sent`);
        break;
      }

      sendError = pilotResult.sendResult.error;
      if (
        !shouldRetryPaperworkSend({
          error: sendError,
          eligibilityStatus: executeEligibility,
          attempt,
        })
      ) {
        errors.push(sendError ?? "Send failed without retry.");
        break;
      }
      attempt += 1;
      execution.retryAttempt = attempt;
      timeline.add("Retry scheduled", sendError ?? "Transient error");
    }
  } else if (!dryRun) {
    execution.error =
      safetyState.goNoGo !== "GO"
        ? safetyState.reason
        : input.candidateId
          ? `Candidate ${input.candidateId} not executable (safety GO but no execute target).`
          : "No AUTO_APPROVED queue candidate available for executeOne.";
    errors.push(execution.error);
  }

  const report = await buildPaperworkCycleReport({
    cycleId,
    candidates,
    sendQueue,
    safetyState,
    execution,
    operatorTimeline: timeline.entries,
    warnings,
    errors,
    pilotConfig,
    approvalSummary,
  });

  await savePaperworkCycleMonitorState(report);
  return { report, executeBatchCalled: false };
}
