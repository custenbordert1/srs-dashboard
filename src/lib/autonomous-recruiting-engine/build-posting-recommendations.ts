import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  buildJobPipelineContext,
  recommendAdActions,
} from "@/lib/hiring-automation-engine/recommend-ad-actions";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { buildRecruitingRecommendations } from "@/lib/recruiting-recommendation-engine";
import { applyApprovalRulesToAds } from "@/lib/autonomous-recruiting-engine/approval-rules";
import { applyRecommendationFeedbackToAds } from "@/lib/autonomous-recruiting-autopilot/apply-feedback-priority";
import type { RecommendationFeedbackIndex } from "@/lib/autonomous-recruiting-autopilot/types";
import type {
  ApprovalRule,
  RecommendedAd,
  TerritoryCoverageNeed,
} from "@/lib/autonomous-recruiting-engine/types";

function urgencyToPriority(urgency: string): "high" | "medium" | "low" {
  if (urgency === "critical" || urgency === "high") return "high";
  if (urgency === "medium") return "medium";
  return "low";
}

function coverageScoreForLocation(
  coverageNeeds: TerritoryCoverageNeed[],
  city: string,
  state: string,
): number | undefined {
  const dm = getDmForState(normalizeStateCode(state)) ?? "Unassigned";
  const byDm = coverageNeeds.find((row) => row.dmName === dm);
  if (byDm) return byDm.coverageNeedScore;
  const byState = coverageNeeds.find((row) => row.states.includes(normalizeStateCode(state)));
  return byState?.coverageNeedScore;
}

function territoryLabel(city: string, state: string): string {
  return getDmForState(normalizeStateCode(state)) ?? `${city}, ${state}`;
}

function mapAdRecommendation(
  rec: ReturnType<typeof recommendAdActions>[number],
  coverageNeeds: TerritoryCoverageNeed[],
  jobLookup: Map<string, BreezyJob>,
): RecommendedAd {
  const job = rec.positionId ? jobLookup.get(rec.positionId) : undefined;
  const city = rec.suggestedCity ?? job?.city ?? "";
  const state = job?.state ?? rec.nearbyLocations?.find((loc) => loc.length === 2) ?? "";
  const coverageNeedScore = coverageScoreForLocation(coverageNeeds, city, state);

  return {
    id: `ad-${rec.type}-${rec.positionId}`,
    title: rec.suggestedTitle ?? rec.title,
    city,
    state,
    territory: territoryLabel(city, state),
    reason: rec.reason,
    expectedApplicants:
      rec.type === "create-new-ad"
        ? { min: 3, max: 8 }
        : rec.type === "refresh-ad"
          ? { min: 2, max: 6 }
          : { min: 0, max: 0 },
    priority: rec.suggestedPriority ?? (rec.type === "create-new-ad" ? "high" : "medium"),
    approvalStatus: "pending",
    coverageNeedScore,
    positionId: rec.positionId,
    breezyJobId: rec.breezyJobId,
    adType: rec.type,
  };
}

function mapRecruitingRecommendation(
  rec: ReturnType<typeof buildRecruitingRecommendations>[number],
  coverageNeeds: TerritoryCoverageNeed[],
  existingIds: Set<string>,
): RecommendedAd | null {
  if (rec.type !== "repost-timing" && rec.type !== "expand-radius" && rec.type !== "nearby-cities") {
    return null;
  }
  const id = `rec-${rec.id}`;
  if (existingIds.has(id)) return null;

  const adType: RecommendedAd["adType"] =
    rec.type === "repost-timing" ? "refresh-ad" : "create-new-ad";
  const coverageNeedScore =
    rec.city && rec.state
      ? coverageScoreForLocation(coverageNeeds, rec.city, rec.state)
      : undefined;

  return {
    id,
    title: rec.recommendation,
    city: rec.city ?? "",
    state: rec.state ?? "",
    territory: rec.city && rec.state ? territoryLabel(rec.city, rec.state) : "Unassigned",
    reason: `${rec.reason} · ${rec.impactEstimate}`,
    expectedApplicants: { min: 1, max: rec.type === "expand-radius" ? 5 : 8 },
    priority: urgencyToPriority(rec.urgency),
    approvalStatus: "pending",
    coverageNeedScore,
    positionId: rec.jobId,
    adType,
  };
}

export function buildPostingRecommendations(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  scoredRows: ScoredCandidateWorkflowRow[];
  coverageNeeds: TerritoryCoverageNeed[];
  fetchedAt: string;
  approvalRules: ApprovalRule[];
  feedbackIndex?: RecommendationFeedbackIndex;
}): RecommendedAd[] {
  const jobContexts = buildJobPipelineContext(
    input.jobs.map((job) => ({
      positionId: job.jobId,
      breezyJobId: job.jobId,
      title: job.name,
      city: job.city,
      state: job.state,
      pipelineStatus: job.status,
    })),
    input.scoredRows,
  );

  const jobLookup = new Map(input.jobs.map((job) => [job.jobId, job]));
  const adRecs = recommendAdActions(jobContexts).map((rec) =>
    mapAdRecommendation(rec, input.coverageNeeds, jobLookup),
  );
  const recruitingRecs = buildRecruitingRecommendations(
    input.jobs,
    input.candidates,
    input.fetchedAt,
    16,
  );

  const existingIds = new Set(adRecs.map((rec) => rec.id));
  const merged = [...adRecs];
  for (const rec of recruitingRecs) {
    const mapped = mapRecruitingRecommendation(rec, input.coverageNeeds, existingIds);
    if (!mapped) continue;
    existingIds.add(mapped.id);
    merged.push(mapped);
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  const sorted = merged.sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      (b.coverageNeedScore ?? 0) - (a.coverageNeedScore ?? 0),
  );

  return applyRecommendationFeedbackToAds(
    applyApprovalRulesToAds(sorted, input.approvalRules, input.coverageNeeds),
    input.feedbackIndex,
  );
}
