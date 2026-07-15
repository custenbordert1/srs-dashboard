import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  buildEmailDuplicateIndex,
  evaluateP204Qualification,
} from "@/lib/p204-ai-candidate-qualification/decide";
import type {
  P204QualificationDecision,
  P204ReasonCode,
  P204SimulationReport,
} from "@/lib/p204-ai-candidate-qualification/types";
import { P204_SCHEMA_VERSION, P204_SOURCE_PHASE } from "@/lib/p204-ai-candidate-qualification/types";

const MINUTES_PER_MANUAL_REVIEW = 8;

function confidenceBucket(confidence: number): string {
  if (confidence >= 90) return "90-100";
  if (confidence >= 80) return "80-89";
  if (confidence >= 70) return "70-79";
  if (confidence >= 60) return "60-69";
  if (confidence >= 50) return "50-59";
  return "0-49";
}

export type P204SimulationResult = {
  report: P204SimulationReport;
  decisions: P204QualificationDecision[];
  publicDecisions: Array<Omit<P204QualificationDecision, "candidateId"> & { candidateId: string }>;
};

/**
 * Read-only simulation across current Applied population.
 * Never writes workflow / Dropbox / MEL / P192.
 */
export async function runP204QualificationSimulation(options?: {
  /** When true, also include Needs Review rows (default: Applied only). */
  includeNeedsReview?: boolean;
}): Promise<P204SimulationResult> {
  const generatedAt = new Date().toISOString();
  const [ingestion, workflows] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
  ]);
  const candidates = listIngestedCandidates(ingestion);
  const emailCounts = buildEmailDuplicateIndex(candidates);

  const decisions: P204QualificationDecision[] = [];
  for (const candidate of candidates) {
    const row = buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], { job: null });
    if (row.workflowStatus === "Applied") {
      decisions.push(evaluateP204Qualification({ row, emailCounts }));
      continue;
    }
    if (options?.includeNeedsReview && row.workflowStatus === "Needs Review") {
      decisions.push(evaluateP204Qualification({ row, emailCounts }));
    }
  }

  const advance = decisions.filter((d) => d.recommendation === "advance_paperwork_needed");
  const review = decisions.filter((d) => d.recommendation === "needs_recruiter_review");
  const reject = decisions.filter((d) => d.recommendation === "reject");
  const total = decisions.length || 1;

  const falsePositiveReviews = review.filter(
    (d) =>
      d.confidence >= 85 &&
      !d.reasonCodes.includes("duplicate_suspect") &&
      !d.reasonCodes.includes("fraud_spam_indicators") &&
      !d.reasonCodes.includes("explicit_disqualify") &&
      !d.reasonCodes.includes("invalid_contact") &&
      (d.components.p193Decision === "Qualified" || d.components.p1934Confidence >= 85),
  );

  const reasonCounts = new Map<P204ReasonCode, number>();
  for (const d of decisions) {
    for (const code of d.reasonCodes) {
      reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
    }
  }
  const topReasonCodes = [...reasonCounts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 15);

  const confidenceDistribution: Record<string, number> = {
    "90-100": 0,
    "80-89": 0,
    "70-79": 0,
    "60-69": 0,
    "50-59": 0,
    "0-49": 0,
  };
  let confidenceSum = 0;
  for (const d of decisions) {
    confidenceSum += d.confidence;
    confidenceDistribution[confidenceBucket(d.confidence)] += 1;
  }

  const automatable = advance.length + reject.length;
  const estimatedRecruiterHoursSaved = Math.round(
    ((automatable * MINUTES_PER_MANUAL_REVIEW) / 60) * 10,
  ) / 10;

  const advancePct = Math.round((advance.length / total) * 1000) / 10;
  const reviewPct = Math.round((review.length / total) * 1000) / 10;
  const rejectPct = Math.round((reject.length / total) * 1000) / 10;
  const averageConfidence =
    decisions.length === 0 ? 0 : Math.round((confidenceSum / decisions.length) * 10) / 10;

  // Pilot readiness: healthy advance band, low reject over-fire, low false-positive review.
  // Population average confidence may stay muted when many Applied rows lack questionnaires.
  const fpPct = review.length === 0 ? 0 : falsePositiveReviews.length / review.length;
  const advanceAvgConfidence =
    advance.length === 0
      ? 0
      : Math.round((advance.reduce((s, d) => s + d.confidence, 0) / advance.length) * 10) / 10;
  const ready =
    decisions.length >= 50 &&
    advance.length >= 20 &&
    advancePct >= 5 &&
    advancePct <= 40 &&
    rejectPct <= 10 &&
    fpPct <= 0.25 &&
    advanceAvgConfidence >= 72;

  const report: P204SimulationReport = {
    generatedAt,
    sourcePhase: P204_SOURCE_PHASE,
    schemaVersion: P204_SCHEMA_VERSION,
    appliedAnalyzed: decisions.length,
    recommendations: {
      advance: advance.length,
      review: review.length,
      reject: reject.length,
      advancePct,
      reviewPct,
      rejectPct,
    },
    averageConfidence,
    confidenceDistribution,
    topReasonCodes,
    falsePositiveReview: {
      count: falsePositiveReviews.length,
      pctOfReviews: Math.round(fpPct * 1000) / 10,
      definition:
        "Needs Recruiter Review with confidence≥85, Qualified/high calibrated signal, and no fraud/dup/disqualify codes (over-cautious review)",
    },
    estimatedRecruiterHoursSaved,
    assumptions: {
      minutesPerManualReview: MINUTES_PER_MANUAL_REVIEW,
    },
    sideEffects: {
      lifecycleWrites: 0,
      paperworkWrites: 0,
      dropbox: 0,
      mel: 0,
      p192: 0,
      automationStarted: 0,
    },
    recommendation: ready ? "Ready for supervised pilot" : "Needs additional tuning",
  };

  const publicDecisions = decisions.map((d) => ({
    ...d,
    candidateId: d.redactedCandidateId,
  }));

  return { report, decisions, publicDecisions };
}
