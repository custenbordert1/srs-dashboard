import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  scoreCandidate,
  type CandidateAiScore,
  type CandidateAiScoreBreakdown,
  type AiLetterGrade,
  type WorkflowRecommendation,
} from "@/lib/candidate-ai-scoring";
import {
  scoreCandidateIntelligence,
  type CandidateIntelligenceScore,
  type CandidateMatchLevel,
} from "@/lib/recruiting-intelligence";
import {
  dmAssignmentNeedsAttention,
  suggestDmForCandidate,
} from "@/lib/candidate-dm-suggest";
import { emptyRecruitingActions, type CandidateRecruitingActions } from "@/lib/candidate-recruiting-actions";
import {
  nextActionForWorkflowStatus,
  type CandidateWorkflowRecord,
  type CandidateWorkflowStatus,
  type PaperworkStatus,
} from "@/lib/candidate-workflow-types";

export type ScoredCandidateWorkflowRow = BreezyCandidate & {
  workflowStatus: CandidateWorkflowStatus;
  lastActionAt: string | null;
  nextActionNeeded: string;
  assignedRecruiter: string;
  assignedDM: string;
  notes: string[];
  history: CandidateWorkflowRecord["history"];
  recruitingActions: CandidateRecruitingActions;
  followUpDueAt: string | null;
  snoozedUntil: string | null;
  signatureRequestId: string | null;
  paperworkTemplateKey: string | null;
  paperworkSentAt: string | null;
  paperworkSignedAt: string | null;
  paperworkStatus: PaperworkStatus;
  paperworkError: string | null;
  suggestedDM: string;
  dmNeedsAssignment: boolean;
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
  matchPercent: number;
  matchLevel: CandidateMatchLevel;
  isTopMatch: boolean;
  hasResume: boolean;
  skillTags: string[];
  distanceMiles: number | null;
  intelligenceSummary: string;
  intelligence: CandidateIntelligenceScore;
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
  options?: { job?: Pick<BreezyJob, "city" | "state" | "zip"> },
): ScoredCandidateWorkflowRow {
  const workflowStatus = local?.workflowStatus ?? deriveWorkflowStatus(candidate);
  const ai = scoreCandidate(candidate, workflowStatus, { resumeText: candidate.resumeText });
  const intelligence = scoreCandidateIntelligence(candidate, {
    job: options?.job
      ? { city: options.job.city, state: options.job.state, zip: options.job.zip }
      : { city: candidate.city, state: candidate.state },
  });

  const suggestedDM = suggestDmForCandidate({
    candidateState: candidate.state,
    jobState: options?.job?.state,
    assignedDM: local?.assignedDM,
  });
  const assignedDM = local?.assignedDM ?? "Unassigned";

  return {
    ...candidate,
    workflowStatus,
    lastActionAt: local?.lastActionAt ?? null,
    nextActionNeeded: local?.nextActionNeeded ?? nextActionForWorkflowStatus(workflowStatus),
    assignedRecruiter: local?.assignedRecruiter ?? "Unassigned",
    assignedDM,
    notes: local?.notes ?? [],
    history: local?.history ?? [],
    recruitingActions: local?.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: local?.followUpDueAt ?? null,
    snoozedUntil: local?.snoozedUntil ?? null,
    signatureRequestId: local?.signatureRequestId ?? null,
    paperworkTemplateKey: local?.paperworkTemplateKey ?? null,
    paperworkSentAt: local?.paperworkSentAt ?? null,
    paperworkSignedAt: local?.paperworkSignedAt ?? null,
    paperworkStatus: local?.paperworkStatus ?? "not_sent",
    paperworkError: local?.paperworkError ?? null,
    suggestedDM,
    dmNeedsAssignment: dmAssignmentNeedsAttention(assignedDM, suggestedDM),
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
    matchPercent: intelligence.matchPercent,
    matchLevel: intelligence.matchLevel,
    isTopMatch: intelligence.isTopMatch,
    hasResume: intelligence.hasResume,
    skillTags: intelligence.skillTagLabels,
    distanceMiles: intelligence.distanceMiles,
    intelligenceSummary: intelligence.summary,
    intelligence,
  };
}
