import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildPlacementEligibility } from "@/lib/workforce-placement-intelligence/build-placement-eligibility";
import type { HumanReviewQueueEntry, PlacementCandidateInput } from "@/lib/workforce-placement-intelligence/types";
import { toPlacementCandidateInput } from "@/lib/workforce-placement-intelligence/types";

function candidateName(row: PlacementCandidateInput): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

export function buildHumanReviewQueue(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingByCandidate?: Map<string, CandidateOnboardingRecord>;
}): HumanReviewQueueEntry[] {
  return input.candidates
    .map((row) => {
      const placementRow = toPlacementCandidateInput(row);
      const eligibility = buildPlacementEligibility({
        row: placementRow,
        onboarding: input.onboardingByCandidate?.get(row.candidateId) ?? null,
      });
      if (eligibility.status !== "human_review") return null;
      return {
        candidateId: row.candidateId,
        candidateName: candidateName(placementRow),
        city: row.city ?? "",
        state: row.state ?? "",
        reasons: eligibility.missingReasons,
        requirements: eligibility.requirements,
        readyForWork: eligibility.readyForWork,
      };
    })
    .filter((row): row is HumanReviewQueueEntry => row != null)
    .sort((a, b) => a.candidateName.localeCompare(b.candidateName));
}
