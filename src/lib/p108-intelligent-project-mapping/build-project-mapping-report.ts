import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildHistoricalPatterns } from "@/lib/p108-intelligent-project-mapping/historical-mapping-patterns";
import { priorDecisionForCandidate, loadMappingReviewRecords } from "@/lib/p108-intelligent-project-mapping/mapping-review-store";
import { recommendCandidateMapping } from "@/lib/p108-intelligent-project-mapping/score-candidate-mapping";
import type {
  CandidateMappingRecommendation,
  MappingDecision,
  MappingReviewQueueItem,
  ProjectMappingAnalytics,
  ProjectMappingReport,
  P108RunMode,
} from "@/lib/p108-intelligent-project-mapping/types";
import { P108_DEFAULT_MODE, P108_SOURCE_PHASE } from "@/lib/p108-intelligent-project-mapping/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import { normalizeStateCode } from "@/lib/dm-territory-map";

function isClosedAdCandidate(input: {
  positionId: string | undefined | null;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId: Map<string, BreezyJob>;
}): boolean {
  const positionId = input.positionId?.trim();
  if (!positionId) return false;
  if (input.jobsByPositionId.has(positionId)) return false;
  return input.closedJobsByPositionId.has(positionId);
}

function buildReviewQueue(
  recommendations: CandidateMappingRecommendation[],
  reviewRecords: Awaited<ReturnType<typeof loadMappingReviewRecords>>,
): MappingReviewQueueItem[] {
  return recommendations
    .filter((r) => r.mappingDecision === "REVIEW" || r.mappingDecision === "AUTO_MAP")
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .map((r) => ({
      candidateId: r.candidateId,
      currentClosedPosition: r.currentClosedPosition,
      recommendedPosition: {
        positionId: r.recommendedPositionId,
        title: r.recommendedPositionTitle,
        city: r.recommendedCity,
        state: r.recommendedState,
      },
      confidence: r.confidenceScore,
      mappingDecision: r.mappingDecision,
      explanation: r.mappingReason,
      explanationHeadline: r.explanationHeadline,
      availableActions: ["approve", "reject", "skip"] as const,
      priorDecision: priorDecisionForCandidate(reviewRecords, r.candidateId),
    }));
}

function buildAnalytics(
  recommendations: CandidateMappingRecommendation[],
  melOpportunities: MelOpportunity[],
): ProjectMappingAnalytics {
  const autoMapCount = recommendations.filter((r) => r.mappingDecision === "AUTO_MAP").length;
  const reviewCount = recommendations.filter((r) => r.mappingDecision === "REVIEW").length;
  const noMatchCount = recommendations.filter((r) => r.mappingDecision === "NO_MATCH").length;
  const averageConfidence =
    recommendations.length > 0
      ? Math.round(
          recommendations.reduce((sum, r) => sum + r.confidenceScore, 0) / recommendations.length,
        )
      : 0;

  const byPosition = new Map<
    string,
    {
      positionId: string;
      title: string;
      city: string;
      state: string;
      candidates: CandidateMappingRecommendation[];
    }
  >();

  for (const rec of recommendations) {
    const key = rec.currentClosedPosition.positionId;
    const existing = byPosition.get(key);
    if (existing) {
      existing.candidates.push(rec);
    } else {
      byPosition.set(key, {
        positionId: key,
        title: rec.currentClosedPosition.title,
        city: rec.currentClosedPosition.city,
        state: rec.currentClosedPosition.state,
        candidates: [rec],
      });
    }
  }

  const topBlockedProjects = [...byPosition.values()]
    .map((group) => {
      const decisions = group.candidates.map((c) => c.mappingDecision);
      const dominantDecision = (
        decisions.filter((d) => d === "NO_MATCH").length >= decisions.length / 2
          ? "NO_MATCH"
          : decisions.filter((d) => d === "REVIEW").length >= decisions.filter((d) => d === "AUTO_MAP").length
            ? "REVIEW"
            : "AUTO_MAP"
      ) as MappingDecision;
      return {
        positionId: group.positionId,
        title: group.title,
        city: group.city,
        state: group.state,
        candidateCount: group.candidates.length,
        averageConfidence: Math.round(
          group.candidates.reduce((sum, c) => sum + c.confidenceScore, 0) / group.candidates.length,
        ),
        dominantDecision,
      };
    })
    .sort((a, b) => b.candidateCount - a.candidateCount)
    .slice(0, 10);

  const topRecoverableProjects = [...byPosition.values()]
    .map((group) => {
      const autoMaps = group.candidates.filter((c) => c.mappingDecision === "AUTO_MAP");
      return {
        positionId: group.positionId,
        title: group.title,
        city: group.city,
        state: group.state,
        candidateCount: group.candidates.length,
        autoMapCount: autoMaps.length,
        averageConfidence: Math.round(
          group.candidates.reduce((sum, c) => sum + c.confidenceScore, 0) / group.candidates.length,
        ),
      };
    })
    .filter((g) => g.autoMapCount > 0 || g.averageConfidence >= 50)
    .sort((a, b) => b.autoMapCount - a.autoMapCount || b.averageConfidence - a.averageConfidence)
    .slice(0, 10);

  const openMel = melOpportunities.filter((o) => o.openStatus);
  const autoMapStates = new Set(
    recommendations
      .filter((r) => r.mappingDecision === "AUTO_MAP")
      .map((r) => normalizeStateCode(r.recommendedState ?? r.currentClosedPosition.state)),
  );

  return {
    autoMapCount,
    reviewCount,
    noMatchCount,
    averageConfidence,
    topBlockedProjects,
    topRecoverableProjects,
    recoveredApplicants: autoMapCount,
    candidatesSaved: autoMapCount + reviewCount,
    coverageImpact: {
      openMelOpportunitiesInScope: openMel.length,
      statesWithDemand: [...new Set(openMel.map((o) => normalizeStateCode(o.state)))].filter(Boolean),
      autoMapStates: [...autoMapStates].filter(Boolean),
      potentialCoverageGain: autoMapCount,
    },
  };
}

function buildSummary(metrics: ProjectMappingReport["metrics"]): string {
  return [
    `Evaluated ${metrics.closedAdCandidatesEvaluated} closed-ad candidates against ${metrics.publishedPositionsConsidered} published postings.`,
    `${metrics.autoMapCount} AUTO_MAP, ${metrics.reviewCount} REVIEW, ${metrics.noMatchCount} NO_MATCH.`,
    `Average confidence ${metrics.averageConfidence}%.`,
    `${metrics.recoveredApplicants} applicants recoverable via auto-map; ${metrics.candidatesSaved} total with mapping path.`,
  ].join(" ");
}

export async function buildProjectMappingReport(input?: {
  mode?: P108RunMode;
  rowsByCandidateId?: Map<string, ScoredCandidateWorkflowRow>;
  jobsByPositionId?: Map<string, BreezyJob>;
  closedJobsByPositionId?: Map<string, BreezyJob>;
  publishedJobs?: BreezyJob[];
  melRows?: MelProjectRow[];
}): Promise<ProjectMappingReport> {
  const mode = input?.mode ?? P108_DEFAULT_MODE;
  const warnings: string[] = [
    "P108 — read-only analysis; no Breezy writes.",
    "P108 — no live sends or production mutations.",
    `Mode: ${mode}.`,
  ];

  const { readIngestionStore } = await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");

  const [store, bundle, jobsResult, closedJobsResult, reviewRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    input?.publishedJobs
      ? Promise.resolve({ ok: true as const, jobs: input.publishedJobs })
      : fetchBreezyJobs("published"),
    input?.closedJobsByPositionId
      ? Promise.resolve({ ok: true as const, jobs: [...input.closedJobsByPositionId.values()] })
      : fetchBreezyJobs("closed"),
    loadMappingReviewRecords(),
  ]);

  const publishedJobs = input?.publishedJobs ?? (jobsResult.ok ? jobsResult.jobs : []);
  const jobsByPositionId =
    input?.jobsByPositionId ??
    new Map(publishedJobs.map((job) => [job.jobId, job]));
  const closedJobsByPositionId =
    input?.closedJobsByPositionId ??
    new Map(
      (closedJobsResult.ok ? closedJobsResult.jobs : []).map((job) => [job.jobId, job]),
    );

  let melOpportunities: MelOpportunity[] = [];
  if (input?.melRows) {
    melOpportunities = parseMelOpportunities(input.melRows);
  } else {
    try {
      const { fetchMelProjectsSheet } = await import("@/lib/mel-projects-sheet");
      const melResult = await fetchMelProjectsSheet();
      if (melResult.ok) {
        melOpportunities = parseMelOpportunities(melResult.rows);
      } else {
        warnings.push(`MEL projects unavailable: ${melResult.error}`);
      }
    } catch (error) {
      warnings.push(
        `MEL projects load failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  const rowsByCandidateId =
    input?.rowsByCandidateId ??
    new Map(
      Object.entries(store.candidates).map(([id, candidate]) => [
        id,
        buildScoredWorkflowRow(candidate, bundle.workflows[id], {
          job: jobsByPositionId.get(candidate.positionId) ?? closedJobsByPositionId.get(candidate.positionId),
        }),
      ]),
    );

  const historicalPatterns = buildHistoricalPatterns(reviewRecords);

  const recommendations: CandidateMappingRecommendation[] = [];

  for (const row of rowsByCandidateId.values()) {
    if (!isClosedAdCandidate({
      positionId: row.positionId,
      jobsByPositionId,
      closedJobsByPositionId,
    })) {
      continue;
    }

    const sourcePositionId = row.positionId!.trim();
    const closedJob = closedJobsByPositionId.get(sourcePositionId);

    recommendations.push(
      recommendCandidateMapping({
        row,
        closedJob,
        sourcePositionId,
        publishedJobs,
        historicalPatterns,
        melOpportunities,
      }),
    );
  }

  recommendations.sort((a, b) => b.confidenceScore - a.confidenceScore);

  const metrics = {
    ...buildAnalytics(recommendations, melOpportunities),
    closedAdCandidatesEvaluated: recommendations.length,
    publishedPositionsConsidered: publishedJobs.length,
  };

  const reviewQueue = buildReviewQueue(recommendations, reviewRecords);

  const withMatch = recommendations.filter((r) => r.recommendedPositionId);
  const highestConfidence = withMatch.slice(0, 5);
  const lowestConfidence = [...withMatch]
    .filter((r) => r.confidenceScore > 0)
    .sort((a, b) => a.confidenceScore - b.confidenceScore)
    .slice(0, 5);

  return {
    sourcePhase: P108_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode,
    summary: buildSummary(metrics),
    metrics,
    recommendations,
    candidateExamples: {
      highestConfidence,
      lowestConfidence,
    },
    reviewQueue,
    warnings,
  };
}
