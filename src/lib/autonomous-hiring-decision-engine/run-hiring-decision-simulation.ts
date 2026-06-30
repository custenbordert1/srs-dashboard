import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { BreezyJob } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type {
  HiringDecision,
  HiringDecisionExecutiveMetrics,
  HiringDecisionSimulationResult,
} from "@/lib/autonomous-hiring-decision-engine/types";
import { P87_PREVIEW_MODE, P87_SOURCE_PHASE } from "@/lib/autonomous-hiring-decision-engine/types";
import { buildHiringDecisions } from "@/lib/autonomous-hiring-decision-engine/build-hiring-decision";
import { buildHiringDecisionQueues } from "@/lib/autonomous-hiring-decision-engine/build-hiring-decision-queues";
import { buildP88AutonomousPaperworkPreview } from "@/lib/autonomous-hiring-decision-engine/build-p88-preview";

function topBlockReasons(decisions: HiringDecision[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const decision of decisions) {
    if (decision.action === "fast_track") continue;
    const sources =
      decision.explanation.negativeFactors.length > 0
        ? decision.explanation.negativeFactors
        : decision.explanation.missingData.length > 0
          ? decision.explanation.missingData
          : decision.explanation.reasoningBullets.filter((b) => b.startsWith("•"));
    for (const raw of sources) {
      const reason = raw.replace(/^•\s*/, "").trim();
      if (!reason) continue;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function countP84Ready(input: {
  rows: ScoredCandidateWorkflowRow[];
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
}): number {
  let count = 0;
  for (const row of input.rows) {
    const eligibility = buildPaperworkSendEligibility({
      row,
      onboarding: input.onboardingByCandidateId.get(row.candidateId) ?? null,
      jobsByPositionId: input.jobsByPositionId,
    });
    if (eligibility.eligible) count += 1;
  }
  return count;
}

export function buildHiringDecisionExecutiveMetrics(
  decisions: HiringDecision[],
): HiringDecisionExecutiveMetrics {
  const queues = buildHiringDecisionQueues(decisions);
  const qualityScores = decisions
    .map((d) => {
      switch (d.grade) {
        case "A":
          return 4;
        case "B":
          return 3;
        case "C":
          return 2;
        case "D":
          return 1;
        default:
          return null;
      }
    })
    .filter((v) => v != null) as number[];
  const confidenceScores = decisions.map((d) => d.explanation.confidenceScore);
  const recruiterTimeSavedMinutes = decisions.reduce(
    (sum, d) => sum + d.explanation.estimatedTimeSavedMinutes,
    0,
  );

  return {
    fastTrackCandidates: queues.fast_track.length,
    readyForPaperwork: decisions.filter((d) =>
      d.explanation.positiveFactors.some((p) => p.toLowerCase().includes("ready for paperwork")),
    ).length,
    needsReview: queues.recruiter_review.length,
    missingInformation: queues.missing_information.length,
    blockedCandidates: queues.hold.length + queues.reject.length,
    holdCandidates: queues.hold.length,
    rejectCandidates: queues.reject.length,
    averageCandidateQuality:
      qualityScores.length > 0
        ? Math.round((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) * 100) / 100
        : null,
    averageConfidenceScore:
      confidenceScores.length > 0
        ? Math.round((confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length) * 100) / 100
        : null,
    recruiterTimeSavedMinutes,
    recruiterHoursSaved: Math.round((recruiterTimeSavedMinutes / 60) * 10) / 10,
    totalCandidates: decisions.length,
  };
}

export function runHiringDecisionSimulation(input: {
  rows: ScoredCandidateWorkflowRow[];
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId?: Map<string, CandidateOnboardingRecord>;
  mtdRangeLabel?: string;
  generatedAt?: string;
}): HiringDecisionSimulationResult {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const onboardingByCandidateId = input.onboardingByCandidateId ?? new Map();
  const decisions = buildHiringDecisions({
    rows: input.rows,
    jobsByPositionId: input.jobsByPositionId,
    onboardingByCandidateId,
    generatedAt,
  });
  const queues = buildHiringDecisionQueues(decisions);
  const executiveMetrics = buildHiringDecisionExecutiveMetrics(decisions);
  const p88 = buildP88AutonomousPaperworkPreview({
    fastTrackDecisions: queues.fast_track,
    jobsByPositionId: input.jobsByPositionId,
    onboardingByCandidateId,
    rows: input.rows,
  });

  return {
    sourcePhase: P87_SOURCE_PHASE,
    previewMode: P87_PREVIEW_MODE,
    generatedAt,
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    totalCandidates: decisions.length,
    fastTrackCount: queues.fast_track.length,
    recruiterReviewCount: queues.recruiter_review.length,
    holdCount: queues.hold.length,
    rejectCount: queues.reject.length,
    missingInformationCount: queues.missing_information.length,
    averageConfidence: executiveMetrics.averageConfidenceScore,
    estimatedRecruiterHoursSaved: executiveMetrics.recruiterHoursSaved,
    topBlockReasons: topBlockReasons(decisions),
    readyForPaperworkCount: executiveMetrics.readyForPaperwork,
    readyForP84Count: countP84Ready({
      rows: input.rows,
      jobsByPositionId: input.jobsByPositionId,
      onboardingByCandidateId,
    }),
    queues,
    decisions,
    executiveMetrics,
    p88PreviewNote: p88.summary,
  };
}
