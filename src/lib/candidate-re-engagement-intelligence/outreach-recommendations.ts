import type {
  CandidateOpportunitySource,
  CandidateReEngagementSegment,
  OutreachRecommendationKind,
  ReEngagementOutreachRecommendation,
} from "@/lib/candidate-re-engagement-intelligence/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

const KIND_LABELS: Record<OutreachRecommendationKind, string> = {
  "call-today": "Call Today",
  "text-today": "Text Today",
  "email-today": "Email Today",
  "escalate-to-recruiter": "Escalate To Recruiter",
  "escalate-to-dm": "Escalate To DM",
  "fast-track-placement": "Fast Track Placement",
};

export function resolveOutreachKind(input: {
  segment: CandidateReEngagementSegment;
  source: CandidateOpportunitySource;
  hasPhone: boolean;
  reEngagementScore: number;
  placementProbability: number;
}): OutreachRecommendationKind {
  if (input.segment === "high-value" && input.placementProbability >= 70) {
    return "fast-track-placement";
  }
  if (input.segment === "dormant" || input.source === "abandoned") {
    return input.hasPhone ? "text-today" : "email-today";
  }
  if (input.reEngagementScore < 30) return "escalate-to-dm";
  if (input.segment === "former-worker" || input.segment === "hot") {
    return input.hasPhone ? "call-today" : "email-today";
  }
  if (input.segment === "warm") return input.hasPhone ? "text-today" : "email-today";
  if (!input.hasPhone) return "email-today";
  return "call-today";
}

export function buildOutreachRecommendation(input: {
  kind: OutreachRecommendationKind;
  reEngagementScore: number;
  placementProbability: number;
  territoryImpact: number;
}): ReEngagementOutreachRecommendation {
  const impactScore = Math.round(
    input.reEngagementScore * 0.4 + input.placementProbability * 0.35 + input.territoryImpact * 0.25,
  );
  const confidenceScore = Math.min(
    100,
    Math.round(45 + input.placementProbability * 0.35 + input.reEngagementScore * 0.2),
  );

  const expectedResult =
    input.kind === "fast-track-placement"
      ? "Accelerated placement review within 48 hours"
      : input.kind === "escalate-to-dm"
        ? "DM visibility and territory coverage intervention"
        : input.kind === "escalate-to-recruiter"
          ? "Recruiter ownership and follow-up within SLA"
          : input.kind === "call-today"
            ? "Live interest confirmation and next-step scheduling"
            : input.kind === "text-today"
              ? "Quick response and re-activation of conversation"
              : "Written re-engagement with project and pay context";

  return {
    kind: input.kind,
    label: KIND_LABELS[input.kind],
    impactScore,
    confidenceScore,
    expectedResult,
  };
}

export function resolveRecommendedTiming(segment: CandidateReEngagementSegment): string {
  if (segment === "hot" || segment === "high-value") return "Within 1 hour";
  if (segment === "warm" || segment === "former-worker") return "Today";
  if (segment === "cold") return "This week";
  return "Within 2 weeks";
}

export function resolveExpectedOutcome(input: {
  segment: CandidateReEngagementSegment;
  placementProbability: number;
  projectName: string;
}): string {
  if (input.segment === "high-value") {
    return `High-likelihood placement on ${input.projectName} (${input.placementProbability}% probability)`;
  }
  if (input.segment === "former-worker") {
    return "Former worker reactivation with faster onboarding path";
  }
  return `Re-activated candidate pipeline for ${input.projectName}`;
}

export function buildOutreachRecommendationsForRow(
  row: ScoredCandidateWorkflowRow,
  input: {
    segment: CandidateReEngagementSegment;
    source: CandidateOpportunitySource;
    reEngagementScore: number;
    placementProbability: number;
    territoryImpact: number;
  },
): ReEngagementOutreachRecommendation {
  const kind = resolveOutreachKind({
    segment: input.segment,
    source: input.source,
    hasPhone: Boolean(row.phone?.trim()),
    reEngagementScore: input.reEngagementScore,
    placementProbability: input.placementProbability,
  });
  return buildOutreachRecommendation({
    kind,
    reEngagementScore: input.reEngagementScore,
    placementProbability: input.placementProbability,
    territoryImpact: input.territoryImpact,
  });
}
