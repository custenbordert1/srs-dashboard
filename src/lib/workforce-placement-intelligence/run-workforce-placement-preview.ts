import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildWorkforcePlacementDashboardSnapshot } from "@/lib/workforce-placement-intelligence/build-workforce-placement-dashboard";
import { buildPlacementEligibility } from "@/lib/workforce-placement-intelligence/build-placement-eligibility";
import { buildWorkforceMarketRecommendations } from "@/lib/workforce-placement-intelligence/build-market-recommendation";
import type {
  WorkforcePlacementCandidateSnapshot,
  WorkforcePlacementPreviewResult,
} from "@/lib/workforce-placement-intelligence/types";
import { P68_PREVIEW_MODE, toPlacementCandidateInput } from "@/lib/workforce-placement-intelligence/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

/**
 * Read-only preview runner — never assigns projects, writes data, or sends notifications.
 */
export function runWorkforcePlacementPreview(input: {
  candidates: ScoredCandidateWorkflowRow[];
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  onboardingRecords?: CandidateOnboardingRecord[];
  fetchedAt?: string;
}): WorkforcePlacementPreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = buildWorkforcePlacementDashboardSnapshot({
    candidates: input.candidates,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    onboardingRecords: input.onboardingRecords,
    fetchedAt,
  });

  const warnings = [
    "Preview mode — no assignments, notifications, MEL updates, or production writes.",
    "Market recommendations optimize hiring markets, not individual projects.",
    "Priority market overrides are preview-only configuration.",
  ];

  if (dashboard.metrics.totalReadyForWork === 0) {
    warnings.push("No Ready For Work candidates in scope yet.");
  }

  if (dashboard.coverageOpportunities.length === 0) {
    warnings.push("No market coverage opportunities found from MEL/rep snapshot.");
  }

  return {
    ok: true,
    previewMode: P68_PREVIEW_MODE,
    fetchedAt,
    dashboard,
    warnings,
  };
}

export function buildWorkforcePlacementCandidatePreview(input: {
  row: ScoredCandidateWorkflowRow;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  onboarding?: CandidateOnboardingRecord | null;
  fetchedAt?: string;
}): WorkforcePlacementCandidateSnapshot | null {
  const placementRow = toPlacementCandidateInput(input.row);
  const eligibility = buildPlacementEligibility({
    row: placementRow,
    onboarding: input.onboarding ?? null,
  });

  if (!eligibility.readyForWork) return null;

  const { recommendations } = buildWorkforceMarketRecommendations({
    candidates: [{ row: placementRow, eligibility }],
    opportunities: input.opportunities,
    activeReps: input.activeReps,
  });

  const recommendation = recommendations[0] ?? null;
  const name = `${input.row.firstName} ${input.row.lastName}`.trim() || input.row.email || "Candidate";

  return {
    candidateId: input.row.candidateId,
    candidateName: name,
    email: input.row.email?.trim() || null,
    city: input.row.city ?? "",
    state: input.row.state ?? "",
    previewMode: P68_PREVIEW_MODE,
    readyForWork: true,
    eligibility,
    recommendation,
    humanReviewRequired: eligibility.status === "human_review",
  };
}
