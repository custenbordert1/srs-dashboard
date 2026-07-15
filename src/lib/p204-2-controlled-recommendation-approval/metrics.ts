import type {
  P2042OperatorDecisionRecord,
  P2042ReviewPackage,
} from "@/lib/p204-2-controlled-recommendation-approval/types";

export type ConfidenceBand = "90-100" | "80-89" | "70-79" | "below-70";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 90) return "90-100";
  if (confidence >= 80) return "80-89";
  if (confidence >= 70) return "70-79";
  return "below-70";
}

function evidenceQuality(pkg: P2042ReviewPackage | undefined): "rich" | "partial" | "poor" {
  if (!pkg) return "poor";
  if (pkg.questionnaireCompleteness === "rich" && !pkg.topNegativeFactors.includes("missing_resume")) {
    return "rich";
  }
  if (pkg.questionnaireCompleteness === "missing") return "poor";
  return "partial";
}

export function buildAgreementAnalysis(input: {
  decisions: P2042OperatorDecisionRecord[];
  packages?: P2042ReviewPackage[];
}): {
  candidatesReviewed: number;
  exactAgreementCount: number;
  exactAgreementRate: number;
  overrideCount: number;
  overrideRate: number;
  deferCount: number;
  staleCount: number;
  agreementByRecommendationType: Record<string, { total: number; agree: number; rate: number }>;
  agreementByConfidenceBand: Record<ConfidenceBand, { total: number; agree: number; rate: number }>;
  agreementByEvidenceQuality: Record<string, { total: number; agree: number; rate: number }>;
  topOverrideReasons: Array<{ reason: string; count: number }>;
  aiTooAggressiveCount: number;
  aiTooConservativeCount: number;
} {
  const pkgById = new Map((input.packages ?? []).map((p) => [p.candidateId, p]));
  const decisions = input.decisions;
  const comparable = decisions.filter(
    (d) => d.decision !== "defer" && d.decision !== "stale_insufficient_evidence",
  );
  const exactAgreementCount = decisions.filter((d) => d.isAgreement).length;
  const overrideCount = decisions.filter((d) => d.isOverride).length;
  const deferCount = decisions.filter((d) => d.decision === "defer").length;
  const staleCount = decisions.filter(
    (d) => d.decision === "stale_insufficient_evidence",
  ).length;

  const byType: Record<string, { total: number; agree: number; rate: number }> = {};
  const byBand: Record<ConfidenceBand, { total: number; agree: number; rate: number }> = {
    "90-100": { total: 0, agree: 0, rate: 0 },
    "80-89": { total: 0, agree: 0, rate: 0 },
    "70-79": { total: 0, agree: 0, rate: 0 },
    "below-70": { total: 0, agree: 0, rate: 0 },
  };
  const byEvidence: Record<string, { total: number; agree: number; rate: number }> = {};

  let aiTooAggressiveCount = 0;
  let aiTooConservativeCount = 0;

  const order = {
    Reject: 0,
    "Needs Recruiter Review": 1,
    Advance: 2,
  } as const;

  for (const d of comparable) {
    const typeBucket = byType[d.aiRecommendation] ?? { total: 0, agree: 0, rate: 0 };
    typeBucket.total += 1;
    if (d.isAgreement) typeBucket.agree += 1;
    byType[d.aiRecommendation] = typeBucket;

    const band = confidenceBand(d.confidence);
    byBand[band].total += 1;
    if (d.isAgreement) byBand[band].agree += 1;

    const eq = evidenceQuality(pkgById.get(d.candidateId));
    const eb = byEvidence[eq] ?? { total: 0, agree: 0, rate: 0 };
    eb.total += 1;
    if (d.isAgreement) eb.agree += 1;
    byEvidence[eq] = eb;

    if (d.isOverride && d.decidedOutcome !== "Deferred" && d.decidedOutcome !== "Stale") {
      const aiRank = order[d.aiRecommendation];
      const opRank = order[d.decidedOutcome as keyof typeof order];
      if (aiRank > opRank) aiTooAggressiveCount += 1;
      if (aiRank < opRank) aiTooConservativeCount += 1;
    }
  }

  for (const k of Object.keys(byType)) {
    const b = byType[k]!;
    b.rate = b.total === 0 ? 0 : Math.round((b.agree / b.total) * 1000) / 10;
  }
  for (const k of Object.keys(byBand) as ConfidenceBand[]) {
    const b = byBand[k]!;
    b.rate = b.total === 0 ? 0 : Math.round((b.agree / b.total) * 1000) / 10;
  }
  for (const k of Object.keys(byEvidence)) {
    const b = byEvidence[k]!;
    b.rate = b.total === 0 ? 0 : Math.round((b.agree / b.total) * 1000) / 10;
  }

  const reasonCounts = new Map<string, number>();
  for (const d of decisions) {
    if (!d.isOverride || !d.overrideReason) continue;
    reasonCounts.set(d.overrideReason, (reasonCounts.get(d.overrideReason) ?? 0) + 1);
  }
  const topOverrideReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const reviewedForRate = comparable.length;
  return {
    candidatesReviewed: decisions.length,
    exactAgreementCount,
    exactAgreementRate:
      reviewedForRate === 0
        ? 0
        : Math.round((exactAgreementCount / reviewedForRate) * 1000) / 10,
    overrideCount,
    overrideRate:
      reviewedForRate === 0
        ? 0
        : Math.round((overrideCount / reviewedForRate) * 1000) / 10,
    deferCount,
    staleCount,
    agreementByRecommendationType: byType,
    agreementByConfidenceBand: byBand,
    agreementByEvidenceQuality: byEvidence,
    topOverrideReasons,
    aiTooAggressiveCount,
    aiTooConservativeCount,
  };
}

export function buildCalibrationAnalysis(input: {
  decisions: P2042OperatorDecisionRecord[];
  packages?: P2042ReviewPackage[];
}): {
  thresholdsUnchanged: true;
  advanceOverriddenToReviewOrReject: number;
  rejectOverriddenToReviewOrAdvance: number;
  reviewOverriddenToAdvanceOrReject: number;
  disagreementConfidenceLevels: number[];
  missingEvidenceAssociatedWithDisagreement: number;
  territoryScoreInfluenceCases: number;
  historicalApplicantInfluenceCases: number;
  recommendation: "keep_thresholds" | "consider_adjustment_next_phase";
  notes: string[];
} {
  const pkgById = new Map((input.packages ?? []).map((p) => [p.candidateId, p]));
  let advanceOverriddenToReviewOrReject = 0;
  let rejectOverriddenToReviewOrAdvance = 0;
  let reviewOverriddenToAdvanceOrReject = 0;
  const disagreementConfidenceLevels: number[] = [];
  let missingEvidenceAssociatedWithDisagreement = 0;
  let territoryScoreInfluenceCases = 0;
  let historicalApplicantInfluenceCases = 0;
  const notes: string[] = [];

  for (const d of input.decisions) {
    if (!d.isOverride) continue;
    disagreementConfidenceLevels.push(d.confidence);
    const pkg = pkgById.get(d.candidateId);

    if (
      d.aiRecommendation === "Advance" &&
      (d.decidedOutcome === "Needs Recruiter Review" || d.decidedOutcome === "Reject")
    ) {
      advanceOverriddenToReviewOrReject += 1;
    }
    if (
      d.aiRecommendation === "Reject" &&
      (d.decidedOutcome === "Needs Recruiter Review" || d.decidedOutcome === "Advance")
    ) {
      rejectOverriddenToReviewOrAdvance += 1;
    }
    if (
      d.aiRecommendation === "Needs Recruiter Review" &&
      (d.decidedOutcome === "Advance" || d.decidedOutcome === "Reject")
    ) {
      reviewOverriddenToAdvanceOrReject += 1;
    }

    if (
      pkg?.topNegativeFactors.some((n) => /missing_/i.test(n)) ||
      pkg?.questionnaireCompleteness === "missing"
    ) {
      missingEvidenceAssociatedWithDisagreement += 1;
    }
    if (
      pkg?.topPositiveFactors.some((p) => /territory|nearby/i.test(p)) ||
      d.overrideReason?.toLowerCase().includes("territory") ||
      d.overrideReason?.toLowerCase().includes("0mi")
    ) {
      territoryScoreInfluenceCases += 1;
    }
    if (pkg?.topNegativeFactors.includes("historical_applicant")) {
      historicalApplicantInfluenceCases += 1;
    }
  }

  const disagreementHeavy =
    advanceOverriddenToReviewOrReject + rejectOverriddenToReviewOrAdvance >= 4;
  if (disagreementHeavy) {
    notes.push("Material override volume on Advance/Reject — consider scoring adjustment next phase.");
  } else {
    notes.push("Override volume does not justify changing thresholds in this phase.");
  }
  notes.push("Thresholds remain unchanged in P204.2.");

  return {
    thresholdsUnchanged: true,
    advanceOverriddenToReviewOrReject,
    rejectOverriddenToReviewOrAdvance,
    reviewOverriddenToAdvanceOrReject,
    disagreementConfidenceLevels,
    missingEvidenceAssociatedWithDisagreement,
    territoryScoreInfluenceCases,
    historicalApplicantInfluenceCases,
    recommendation: disagreementHeavy
      ? "consider_adjustment_next_phase"
      : "keep_thresholds",
    notes,
  };
}

export function buildFuturePilotForecast(input: {
  decisions: P2042OperatorDecisionRecord[];
}): {
  forecastOnly: true;
  approvedAdvance: number;
  approvedNeedsReview: number;
  approvedReject: number;
  deferred: number;
  stale: number;
  blockedByEvidence: number;
  eligibleForFutureControlledActionPilot: number;
  notes: string[];
} {
  let approvedAdvance = 0;
  let approvedNeedsReview = 0;
  let approvedReject = 0;
  let deferred = 0;
  let stale = 0;
  let blockedByEvidence = 0;

  for (const d of input.decisions) {
    if (d.decision === "defer") {
      deferred += 1;
      continue;
    }
    if (d.decision === "stale_insufficient_evidence") {
      stale += 1;
      continue;
    }
    if (d.safetyFlags.length > 0) {
      blockedByEvidence += 1;
      continue;
    }
    if (d.decidedOutcome === "Advance") approvedAdvance += 1;
    else if (d.decidedOutcome === "Needs Recruiter Review") approvedNeedsReview += 1;
    else if (d.decidedOutcome === "Reject") approvedReject += 1;
  }

  return {
    forecastOnly: true,
    approvedAdvance,
    approvedNeedsReview,
    approvedReject,
    deferred,
    stale,
    blockedByEvidence,
    eligibleForFutureControlledActionPilot: approvedAdvance + approvedNeedsReview + approvedReject,
    notes: [
      "Forecast only — no lifecycle / PN / reject / Dropbox / MEL actions performed.",
      "Safety-flagged candidates are blocked from future lifecycle pilot eligibility until resolved.",
    ],
  };
}

export function collectSafetyExceptions(
  packages: P2042ReviewPackage[],
): Array<{ redactedCandidateId: string; flags: string[] }> {
  return packages
    .filter((p) => p.safetyFlags.length > 0)
    .map((p) => ({
      redactedCandidateId: p.redactedCandidateId,
      flags: p.safetyFlags,
    }));
}
