import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { buildPaperworkRemediationReport } from "@/lib/p134-paperwork-remediation-engine/build-paperwork-remediation-report";
import { clonePaperworkContext } from "@/lib/p135-paperwork-remediation-executor/clone-paperwork-context";
import { executeCandidateRemediationPreview } from "@/lib/p135-paperwork-remediation-executor/execute-candidate-remediation";
import type { PaperworkRemediationExecutorReport } from "@/lib/p135-paperwork-remediation-executor/types";
import { P135_EXECUTOR_MODE, P135_SOURCE_PHASE } from "@/lib/p135-paperwork-remediation-executor/types";

export async function buildPaperworkRemediationExecutorReport(input?: {
  previewOnly?: boolean;
  maxCandidates?: number;
  tierFilter?: Array<1 | 2 | 3>;
  contextOverride?: Awaited<ReturnType<typeof loadPaperworkCandidates>>;
}): Promise<PaperworkRemediationExecutorReport> {
  const previewOnly = input?.previewOnly ?? true;
  const pilotConfig = loadPilotConfig();
  const baseContext = input?.contextOverride ?? (await loadPaperworkCandidates({ mtdOnly: false }));
  const remediation = await buildPaperworkRemediationReport({ contextOverride: baseContext });

  const tierFilter = input?.tierFilter ?? [1, 2, 3];
  const candidatePlans = remediation.candidatePlans
    .filter((plan) => tierFilter.includes(plan.tier))
    .sort((a, b) => a.scoreGapToAutoApprove - b.scoreGapToAutoApprove || b.currentScore - a.currentScore);

  const maxCandidates = input?.maxCandidates ?? 30;
  const plansToProcess = candidatePlans.slice(0, maxCandidates);

  const ingestionStore = await readIngestionStore();
  const ingestionByCandidateId = new Map(
    plansToProcess
      .map((plan) => {
        const candidate = ingestionStore.candidates[plan.candidateId];
        return candidate ? ([plan.candidateId, candidate] as const) : null;
      })
      .filter((entry): entry is readonly [string, (typeof ingestionStore.candidates)[string]] => entry !== null),
  );

  const candidateResults = [];
  for (const plan of plansToProcess) {
    const context = clonePaperworkContext(baseContext);
    const result = await executeCandidateRemediationPreview({
      context,
      plan,
      ingestionByCandidateId,
    });
    candidateResults.push(result);
  }

  const allRecords = candidateResults.flatMap((result) => result.executionRecords);
  const humanTaskQueue = candidateResults
    .flatMap((result) => result.humanTasks)
    .sort((a, b) => a.priority - b.priority);

  const automaticFixesCompleted = allRecords.filter((record) => record.automatic && record.success).length;
  const manualFixesRemaining = humanTaskQueue.length;
  const recentlyResolved = candidateResults
    .filter((result) => result.blockersCleared.length > 0 || result.afterScore > result.beforeScore)
    .map((result) => ({
      candidateId: result.candidateId,
      candidateName: result.candidateName,
      beforeDecision: result.beforeDecision,
      afterDecision: result.afterDecision,
      scoreDelta: result.afterScore - result.beforeScore,
    }))
    .slice(0, 15);

  const failedRemediations = allRecords.filter((record) => !record.success);
  const retryableFailures = failedRemediations.filter((record) =>
    ["refresh_resume_detection", "refresh_questionnaire_enrichment", "refresh_candidate_enrichment"].includes(
      record.action,
    ),
  );

  const candidatesNowAutoApproved = candidateResults.filter((result) => result.afterDecision === "AUTO_APPROVED").length;
  const estimatedApprovalsUnlocked = candidateResults.filter(
    (result) => result.afterDecision === "AUTO_APPROVED" && result.beforeDecision !== "AUTO_APPROVED",
  ).length;

  let goNoGo: PaperworkRemediationExecutorReport["goNoGo"] = "GO WITH CONDITIONS";
  let goNoGoReason =
    "Preview executor completed safe local remediations — manual Breezy tasks remain for structural blockers.";

  if (estimatedApprovalsUnlocked > 0) {
    goNoGoReason = `${estimatedApprovalsUnlocked} candidate(s) reached AUTO_APPROVED after safe local fixes in preview.`;
  } else if (manualFixesRemaining > 0 && automaticFixesCompleted > 0) {
    goNoGoReason = `${automaticFixesCompleted} automatic preview actions completed; ${manualFixesRemaining} manual tasks queued.`;
  } else if (automaticFixesCompleted === 0) {
    goNoGo = "NO-GO";
    goNoGoReason = "No safe automatic remediations could be applied in preview.";
  }

  return {
    sourcePhase: P135_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P135_EXECUTOR_MODE,
    previewOnly,
    summary: {
      candidatesProcessed: candidateResults.length,
      automaticFixesCompleted,
      manualFixesRemaining,
      estimatedApprovalsUnlocked,
      recentlyResolvedCount: recentlyResolved.length,
      failedRemediationCount: failedRemediations.length,
      candidatesNowAutoApproved,
    },
    executivePanel: {
      automaticFixesCompleted,
      manualFixesRemaining,
      estimatedApprovalsUnlocked,
      recentlyResolvedCandidates: recentlyResolved,
      auditHistory: allRecords.slice(-50),
      failedRemediations: failedRemediations.slice(-20),
      retryableFailures: retryableFailures.slice(-20),
    },
    humanTaskQueue: humanTaskQueue.slice(0, 100),
    candidateResults,
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
  };
}

export async function runRemediationExecutorPreview(input?: {
  maxCandidates?: number;
  tierFilter?: Array<1 | 2 | 3>;
}): Promise<PaperworkRemediationExecutorReport> {
  return buildPaperworkRemediationExecutorReport({
    previewOnly: true,
    maxCandidates: input?.maxCandidates,
    tierFilter: input?.tierFilter,
  });
}
