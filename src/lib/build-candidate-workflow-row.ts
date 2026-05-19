import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  scoreCandidate,
  type CandidateAiScore,
  type CandidateAiScoreBreakdown,
  type AiLetterGrade,
  type WorkflowRecommendation,
} from "@/lib/candidate-ai-scoring";
import {
  nextActionForWorkflowStatus,
  type CandidateWorkflowRecord,
  type CandidateWorkflowStatus,
} from "@/lib/candidate-workflow-types";

export type ScoredCandidateWorkflowRow = BreezyCandidate & {
  workflowStatus: CandidateWorkflowStatus;
  lastActionAt: string | null;
  nextActionNeeded: string;
  assignedRecruiter: string;
  assignedDM: string;
  notes: string[];
  history: CandidateWorkflowRecord["history"];
  resumeKeywordScore: number | null;
  merchandisingExperienceScore: number | null;
  retailExperienceScore: number | null;
  travelFitScore: number | null;
  overallCandidateScore: number | null;
  aiRecommendation: string;
  aiGrade: AiLetterGrade;
  aiNumericScore: number;
  aiRecommendations: WorkflowRecommendation[];
  aiSummary: string;
  aiBreakdown: CandidateAiScoreBreakdown;
  ai: CandidateAiScore;
};

function stageIncludes(candidate: BreezyCandidate, words: string[]): boolean {
  const stage = candidate.stage.toLowerCase();
  return words.some((word) => stage.includes(word));
}

function deriveWorkflowStatus(candidate: BreezyCandidate): CandidateWorkflowStatus {
  if (stageIncludes(candidate, ["active rep", "active"])) return "Active Rep";
  if (stageIncludes(candidate, ["loaded in mel", "loaded"])) return "Loaded in MEL";
  if (stageIncludes(candidate, ["training"])) return "Training Needed";
  if (stageIncludes(candidate, ["ready for mel", "signed"])) return "Ready for MEL";
  if (stageIncludes(candidate, ["paperwork sent", "document sent"])) return "Paperwork Sent";
  if (stageIncludes(candidate, ["paperwork", "hellosign", "offer"])) return "Paperwork Needed";
  if (stageIncludes(candidate, ["qualified", "interview", "screen", "assessment"])) return "Qualified";
  if (stageIncludes(candidate, ["rejected", "disqualified", "not qualified", "archived"])) return "Not Qualified";
  if (stageIncludes(candidate, ["applied", "new"])) return "Applied";
  return "Needs Review";
}

export function buildScoredWorkflowRow(
  candidate: BreezyCandidate,
  local?: CandidateWorkflowRecord,
): ScoredCandidateWorkflowRow {
  const workflowStatus = local?.workflowStatus ?? deriveWorkflowStatus(candidate);
  const ai = scoreCandidate(candidate, workflowStatus);

  return {
    ...candidate,
    workflowStatus,
    lastActionAt: local?.lastActionAt ?? null,
    nextActionNeeded: local?.nextActionNeeded ?? nextActionForWorkflowStatus(workflowStatus),
    assignedRecruiter: local?.assignedRecruiter ?? "Unassigned",
    assignedDM: local?.assignedDM ?? "Unassigned",
    notes: local?.notes ?? [],
    history: local?.history ?? [],
    resumeKeywordScore: ai.breakdown.resumeSourceQuality,
    merchandisingExperienceScore: ai.breakdown.merchandisingKeywords + ai.breakdown.resetExperience,
    retailExperienceScore: ai.breakdown.walmartTargetExperience,
    travelFitScore: ai.breakdown.travelWillingness,
    overallCandidateScore: ai.numericScore,
    aiRecommendation: ai.summary,
    aiGrade: ai.letterGrade,
    aiNumericScore: ai.numericScore,
    aiRecommendations: ai.recommendations,
    aiSummary: ai.summary,
    aiBreakdown: ai.breakdown,
    ai,
  };
}
