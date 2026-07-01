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
    confirmationPhrase: input.confirmationPhrase,
    context,
    candidates,
  });

  const target =
    (input.candidateId
      ? sendQueue.remainingQueue.find((candidate) => candidate.candidateId === input.candidateId)
      : sendQueue.nextCandidate) ?? null;

  let execution: PaperworkCycleReport["execution"] = {
    executed: false,
    mode: dryRun ? "dryRun" : "none",
    candidateId: target?.candidateId ?? null,
    outcome: "not_executed",
    signatureRequestId: null,
    error: dryRun ? "dryRun default — no send executed." : null,
    retryAttempt: 0,
    executeBatchCalled: false,
  };

  if (!dryRun && target && safetyState.goNoGo === "GO") {
    timeline.add("executeOne started", target.candidateName);
    const runPilot = input.runPilotSend ?? runControlledLivePaperworkPilot;
    let attempt = 0;
    let sendError: string | null = null;

    while (attempt < 3) {
      const pilotResult = await runPilot({
        dryRun: false,
        confirmationPhrase: input.confirmationPhrase ?? P122_CONFIRMATION_PHRASE,
        candidateId: target.candidateId,
        byUserId: input.byUserId ?? "p123-paperwork-orchestrator",
      });

      const sent = pilotResult.sendResult.outcome === "sent";
      execution = {
        executed: sent,
        mode: pilotResult.executedMode,
        candidateId: target.candidateId,
        outcome: pilotResult.sendResult.outcome,
        signatureRequestId: pilotResult.sendResult.signatureRequestId,
        error: pilotResult.sendResult.error,
        retryAttempt: attempt,
        executeBatchCalled: false,
      };

      if (sent) {
        timeline.add("Dropbox request created", pilotResult.sendResult.signatureRequestId ?? "pending");
        timeline.add("Audit written", "P100 audit + pilot registry updated");
        timeline.add("Success", `${target.candidateName} paperwork sent`);
        break;
      }

      sendError = pilotResult.sendResult.error;
      if (!shouldRetryPaperworkSend({ error: sendError, eligibilityStatus: target.eligibilityStatus, attempt })) {
        errors.push(sendError ?? "Send failed without retry.");
        break;
      }
      attempt += 1;
      execution.retryAttempt = attempt;
      timeline.add("Retry scheduled", sendError ?? "Transient error");
    }
  } else if (!dryRun) {
    execution.error = safetyState.reason;
    errors.push(safetyState.reason);
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
