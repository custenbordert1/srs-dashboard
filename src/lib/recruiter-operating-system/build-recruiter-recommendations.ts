import { filterRecommendationsForRecruiterScope } from "@/lib/recruiter-operating-system/filter-recruiter-scope";
import type {
  RecruiterOperatingSystemScope,
  RecruiterRecommendation,
  RecruiterRecommendationKind,
} from "@/lib/recruiter-operating-system/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { RecruiterCandidatePriorityRow } from "@/lib/recruiter-operating-system/types";

const KIND_MAP: Partial<Record<AutopilotRecommendation["kind"], RecruiterRecommendationKind>> = {
  "create-candidate-outreach-campaign": "contact-candidate",
  "reopen-previous-candidates": "re-engage",
  "escalate-to-dm": "escalate-to-dm",
  "increase-follow-up-frequency": "increase-follow-up-frequency",
  "assign-additional-recruiter": "fill-store-first",
  "launch-territory-blitz": "focus-on-project",
};

function mapRecommendation(rec: AutopilotRecommendation): RecruiterRecommendation {
  const kind =
    KIND_MAP[rec.kind] ??
    (rec.entityType === "project"
      ? "focus-on-project"
      : rec.entityType === "store-cluster"
        ? "fill-store-first"
        : "contact-candidate");

  return {
    id: rec.id,
    kind,
    title: rec.title,
    detail: rec.reasoning,
    impactScore: rec.impactScore,
    confidenceScore: rec.confidenceScore,
    expectedResult: `+${rec.opportunity.estimatedCandidateGain} candidates · +${rec.opportunity.estimatedCoverageGain}% coverage`,
    source: rec,
  };
}

function candidateRecommendations(
  priorities: RecruiterCandidatePriorityRow[],
): RecruiterRecommendation[] {
  return priorities.slice(0, 5).map((row) => ({
    id: `rec-contact:${row.candidateId}`,
    kind: row.heat === "at-risk" ? "escalate-to-dm" : row.heat === "cold" ? "re-engage" : "contact-candidate",
    title: `Contact ${row.candidateName}`,
    detail: row.recommendedNextAction,
    impactScore: row.score,
    confidenceScore: row.placementLikelihood,
    expectedResult: `${row.placementLikelihood}% placement likelihood · ${row.territoryDemandScore} territory demand`,
  }));
}

export function buildRecruiterRecommendations(input: {
  recommendations: AutopilotRecommendation[];
  scope: RecruiterOperatingSystemScope;
  candidatePriorities: RecruiterCandidatePriorityRow[];
  limit?: number;
}): RecruiterRecommendation[] {
  const limit = input.limit ?? 15;
  const platform = filterRecommendationsForRecruiterScope(input.recommendations, input.scope).map(
    mapRecommendation,
  );
  const candidate = candidateRecommendations(input.candidatePriorities);
  const merged = [...platform, ...candidate];
  const deduped = new Map<string, RecruiterRecommendation>();
  for (const rec of merged) {
    const existing = deduped.get(rec.id);
    if (!existing || rec.impactScore > existing.impactScore) deduped.set(rec.id, rec);
  }
  return [...deduped.values()]
    .sort((a, b) => b.impactScore * b.confidenceScore - a.impactScore * a.confidenceScore)
    .slice(0, limit);
}
