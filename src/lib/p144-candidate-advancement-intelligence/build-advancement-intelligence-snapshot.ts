import type { CandidateAdvancementEvaluation } from "@/lib/recruiting/candidate-advancement-engine";
import { ADVANCEMENT_SCORE_WEIGHTS } from "@/lib/recruiting/candidate-advancement-engine";
import type {
  AutomationPreviewQueueRow,
  CandidateAdvancementIntelligenceSnapshot,
  CandidateAdvancementValidationReport,
} from "@/lib/p144-candidate-advancement-intelligence/types";
import { P144_MODE, P144_SOURCE_PHASE } from "@/lib/p144-candidate-advancement-intelligence/types";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function groupDistribution(
  evaluations: CandidateAdvancementEvaluation[],
  key: "recruiter" | "projectName",
): Array<{ label: string; count: number; avgScore: number }> {
  const map = new Map<string, number[]>();
  for (const evaluation of evaluations) {
    const label = key === "recruiter" ? evaluation.recruiter : evaluation.projectName ?? "Unknown";
    const bucket = map.get(label) ?? [];
    bucket.push(evaluation.advancementScore);
    map.set(label, bucket);
  }
  return [...map.entries()]
    .map(([label, scores]) => ({ label, count: scores.length, avgScore: average(scores) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function buildValidationReport(evaluations: CandidateAdvancementEvaluation[]): CandidateAdvancementValidationReport {
  const automationEligible = evaluations.filter((e) => e.automationEligible);
  const manualReview = evaluations.filter(
    (e) => e.blockers.includes("Manual Review Required") || e.nextAction === "Needs Review",
  );

  const blockerCounts = new Map<string, number>();
  for (const evaluation of evaluations) {
    for (const blocker of evaluation.blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
  }

  const recruiterDistribution = groupDistribution(evaluations, "recruiter").map((row) => ({
    recruiter: row.label,
    count: row.count,
    avgScore: row.avgScore,
  }));
  const projectDistribution = groupDistribution(evaluations, "projectName").map((row) => ({
    project: row.label,
    count: row.count,
    avgScore: row.avgScore,
  }));

  const stageCounts = new Map<string, number>();
  for (const evaluation of evaluations) {
    stageCounts.set(evaluation.workflowStatus, (stageCounts.get(evaluation.workflowStatus) ?? 0) + 1);
  }
  const pipelineBottlenecks = [...stageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([stage, count]) => `${stage}: ${count} candidate(s)`);

  return {
    topAutomationCandidates: [...automationEligible]
      .sort((a, b) => b.advancementScore - a.advancementScore)
      .slice(0, 25),
    topManualReviewCandidates: [...manualReview]
      .sort((a, b) => a.advancementScore - b.advancementScore)
      .slice(0, 25),
    averageAdvancementScore: average(evaluations.map((e) => e.advancementScore)),
    averageHireProbability: average(evaluations.map((e) => e.estimatedHireProbability)),
    distributionByRecruiter: recruiterDistribution,
    distributionByProject: projectDistribution,
    pipelineBottlenecks,
    largestBlockers: [...blockerCounts.entries()]
      .map(([blocker, count]) => ({ blocker, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    automationEligibleCount: automationEligible.length,
  };
}

function buildAutomationPreviewQueue(
  evaluations: CandidateAdvancementEvaluation[],
): AutomationPreviewQueueRow[] {
  return evaluations
    .filter((e) => e.automationEligible)
    .sort((a, b) => b.confidence - a.confidence || b.advancementScore - a.advancementScore)
    .slice(0, 50)
    .map((evaluation) => ({
      candidateId: evaluation.candidateId,
      candidateName: evaluation.candidateName,
      project: evaluation.projectName ?? evaluation.positionName,
      recruiter: evaluation.recruiter,
      suggestedAction: evaluation.nextAction,
      reason: evaluation.reason,
      confidence: evaluation.confidence,
      advancementScore: evaluation.advancementScore,
      automationEligible: true,
      previewOnly: true as const,
      approveDisabled: true as const,
      rejectDisabled: true as const,
    }));
}

export function buildCandidateAdvancementIntelligenceSnapshot(input: {
  evaluations: CandidateAdvancementEvaluation[];
  generatedAt: string;
  partialSync: boolean;
}): CandidateAdvancementIntelligenceSnapshot {
  const pilotConfig = loadPilotConfig();
  const validation = buildValidationReport(input.evaluations);
  const automationPreviewQueue = buildAutomationPreviewQueue(input.evaluations);

  const readyToAdvance = input.evaluations.filter(
    (e) => e.nextAction === "Send Paperwork" || e.nextAction === "Ready for MEL",
  ).length;
  const manualReviewQueue = input.evaluations.filter(
    (e) => e.nextAction === "Needs Review" || e.blockers.includes("Manual Review Required"),
  ).length;
  const highestProbabilityHires = input.evaluations.filter((e) => e.estimatedHireProbability >= 75).length;
  const highestRiskCandidates = input.evaluations.filter(
    (e) => e.urgency === "critical" || e.estimatedHireProbability <= 25,
  ).length;

  const pipelineHealthScore = average([
    validation.averageAdvancementScore,
    100 - Math.min(100, manualReviewQueue * 2),
    Math.min(100, validation.automationEligibleCount * 3),
  ]);

  return {
    sourcePhase: P144_SOURCE_PHASE,
    generatedAt: input.generatedAt,
    mode: P144_MODE,
    partialSync: input.partialSync,
    candidatesEvaluated: input.evaluations.length,
    scoreWeights: ADVANCEMENT_SCORE_WEIGHTS,
    evaluations: input.evaluations,
    executive: {
      automationCandidatesToday: validation.automationEligibleCount,
      readyToAdvance,
      manualReviewQueue,
      highestProbabilityHires,
      highestRiskCandidates,
      averageAdvancementScore: validation.averageAdvancementScore,
      averageHireProbability: validation.averageHireProbability,
      pipelineHealthScore,
    },
    automationPreviewQueue,
    validation,
    executeBatchCalled: false,
    breezyWrites: false,
    paperworkSent: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
  };
}
