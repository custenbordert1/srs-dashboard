import type { PilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import type { ApprovalSummary } from "@/lib/autonomous-paperwork-approval-engine/types";
import type {
  OrchestratorCandidateRecord,
  OrchestratorSafetyState,
  OperatorTimelineEntry,
  PaperworkCycleExecutionResult,
  PaperworkCycleReport,
  SendQueueSnapshot,
} from "@/lib/autonomous-paperwork-orchestrator/types";
import { P123_AVERAGE_SEND_MINUTES, P123_SOURCE_PHASE } from "@/lib/autonomous-paperwork-orchestrator/types";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";

export async function buildPaperworkCycleReport(input: {
  cycleId: string;
  candidates: OrchestratorCandidateRecord[];
  sendQueue: SendQueueSnapshot;
  safetyState: OrchestratorSafetyState;
  execution: PaperworkCycleExecutionResult;
  operatorTimeline: OperatorTimelineEntry[];
  warnings: string[];
  errors: string[];
  pilotConfig: PilotConfig;
  approvalSummary: ApprovalSummary | null;
}): Promise<PaperworkCycleReport> {
  const readyCandidates = input.candidates.filter(
    (candidate) =>
      candidate.eligibilityStatus === "READY_TO_SEND" || candidate.eligibilityStatus === "READY_AFTER_APPROVAL",
  );
  const blockedCandidates = input.candidates.filter((candidate) => !candidate.safeToSend);
  const registry = await loadPilotSendRegistry();
  const sentCount = registry.sendCount;
  const successRate = sentCount === 0 ? 0 : Math.round((sentCount / Math.max(sentCount + input.errors.length, 1)) * 100);

  let currentStep: PaperworkCycleReport["currentStep"] = "complete";
  let progressPercent = 100;
  if (input.execution.mode === "dryRun") {
    currentStep = "build_queue";
    progressPercent = 70;
  } else if (input.execution.executed) {
    currentStep = "complete";
    progressPercent = 100;
  } else if (input.safetyState.goNoGo === "NO-GO") {
    currentStep = "evaluate_safety";
    progressPercent = 55;
  }

  return {
    sourcePhase: P123_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    cycleId: input.cycleId,
    cycleStatus: input.execution.executed ? "completed" : input.safetyState.goNoGo === "NO-GO" ? "blocked" : "idle",
    currentStep,
    progressPercent,
    candidates: input.candidates,
    readyCandidates,
    blockedCandidates,
    sendQueue: input.sendQueue,
    safetyState: input.safetyState,
    execution: input.execution,
    operatorTimeline: input.operatorTimeline,
    metrics: {
      candidatesEvaluated: input.candidates.length,
      readyCount: readyCandidates.length,
      blockedCount: blockedCandidates.length,
      successRate,
      averageSendTimeMinutes: P123_AVERAGE_SEND_MINUTES,
      queueDepth: input.sendQueue.queueDepth,
    },
    operatorMode: input.pilotConfig.operatorGo ? "GO" : "NO-GO",
    pilotMode: input.pilotConfig.pilotEnabled,
    liveMode: input.pilotConfig.liveModeEnabled,
    approvalRequired: readyCandidates.some((candidate) => candidate.eligibilityStatus === "READY_AFTER_APPROVAL"),
    warnings: input.warnings,
    errors: input.errors,
    etaMinutes: input.sendQueue.estimatedCompletionMinutes,
    lastExecutionAt: registry.lastSendResult?.executedAt ?? null,
    approvalSummary: input.approvalSummary,
  };
}
