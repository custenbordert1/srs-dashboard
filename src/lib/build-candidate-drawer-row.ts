import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildCandidateIntelligenceProfile } from "@/lib/candidate-intelligence-engine";
import { buildCandidateScoringInput } from "@/lib/candidate-resume-prep";
import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";
import {
  deriveRecommendedNextAction,
  emptyRecruitingActions,
  type CandidateRecruitingActions,
} from "@/lib/candidate-recruiting-actions";
import { buildScoredWorkflowRow, type ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

export function buildCandidateDrawerRow(
  candidate: BreezyCandidate,
  options?: {
    workflow?: CandidateWorkflowRecord;
    territoryStates?: string[];
    recruitingActions?: CandidateRecruitingActions;
    referenceIso?: string;
  },
): CandidateDrawerRow {
  const scored = buildScoredWorkflowRow(candidate, options?.workflow);
  return buildCandidateDrawerRowFromScored(scored, options);
}

export function buildCandidateDrawerRowFromScored(
  scored: ScoredCandidateWorkflowRow,
  options?: {
    territoryStates?: string[];
    recruitingActions?: CandidateRecruitingActions;
    referenceIso?: string;
  },
): CandidateDrawerRow {
  const referenceIso = options?.referenceIso ?? new Date().toISOString();
  const intelligence = buildCandidateIntelligenceProfile(buildCandidateScoringInput(scored), {
    referenceIso,
    territoryStates: options?.territoryStates,
  });
  const recruitingActions = options?.recruitingActions ?? emptyRecruitingActions();

  return {
    candidateId: scored.candidateId,
    firstName: scored.firstName,
    lastName: scored.lastName,
    email: scored.email,
    phone: scored.phone,
    source: scored.source,
    stage: scored.stage,
    appliedDate: scored.appliedDate,
    positionName: scored.positionName,
    city: scored.city,
    state: scored.state,
    workflowStatus: scored.workflowStatus,
    lastActionAt: scored.lastActionAt,
    nextActionNeeded: scored.nextActionNeeded,
    assignedRecruiter: scored.assignedRecruiter,
    assignedDM: scored.assignedDM,
    notes: scored.notes,
    history: scored.history,
    overallCandidateScore: scored.overallCandidateScore,
    aiRecommendation: scored.aiRecommendation,
    aiGrade: scored.aiGrade,
    aiNumericScore: intelligence.score,
    aiRecommendations: scored.aiRecommendations,
    aiBreakdown: scored.aiBreakdown,
    resumeKeywordScore: scored.resumeKeywordScore,
    merchandisingExperienceScore: scored.merchandisingExperienceScore,
    retailExperienceScore: scored.retailExperienceScore,
    travelFitScore: scored.travelFitScore,
    strengths: intelligence.strengths,
    concerns: intelligence.concerns,
    suggestedProjects: intelligence.suggestedProjects,
    bestFit: intelligence.bestFit,
    bestFitReason: intelligence.bestFitReason,
    tierLabel: intelligence.tierLabel,
    extractedKeywords: intelligence.extractedKeywords,
    recommendedNextAction: deriveRecommendedNextAction(
      recruitingActions,
      scored.nextActionNeeded,
      intelligence.bestFitReason,
    ),
    recruitingActions,
    matchedOpportunities: [],
    melMatchingSummary: "",
  };
}
