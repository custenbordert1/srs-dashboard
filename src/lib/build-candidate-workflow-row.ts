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
  baselineCandidateReadinessScore,
  buildCandidateIntelligenceBundle,
} from "@/lib/candidate-readiness";
import type {
  CandidateQuestionnaireIntelligence,
  CandidateReadinessScore,
  CandidateResumeIntelligence,
} from "@/lib/candidate-readiness/types";
import {
  dmAssignmentNeedsAttention,
  suggestDmForCandidate,
} from "@/lib/candidate-dm-suggest";
import { emptyRecruitingActions, type CandidateRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { resolveRecruiterNextAction } from "@/lib/recruiter-candidate-intelligence";
import type { DirectDepositStatus } from "@/lib/direct-deposit-types";
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
  paperworkViewedAt: string | null;
  paperworkViewCount: number;
  paperworkSignedAt: string | null;
  paperworkStatus: PaperworkStatus;
  paperworkError: string | null;
  onboardingContactEmail: string | null;
  directDepositStatus: DirectDepositStatus;
  directDepositRequestedAt: string | null;
  directDepositLastReminderAt: string | null;
  directDepositNotes: string | null;
  directDepositTriggeredByUserId: string | null;
  directDepositLastDeliveryMode: "log" | "resend" | null;
  directDepositLastHrCopyIncluded: boolean | null;
  directDepositLastHrBccAddress: string | null;
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
  resumeIntelligence: CandidateResumeIntelligence;
  questionnaireIntelligence: CandidateQuestionnaireIntelligence;
  candidateGrade: CandidateReadinessScore;
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

const BASELINE_INTELLIGENCE: CandidateIntelligenceScore = {
  matchPercent: 0,
  matchLevel: "no_resume",
  isTopMatch: false,
  hasResume: false,
  skillTags: [],
  skillTagLabels: [],
  factors: { experience: 0, travelRadius: 0, responseSpeed: 0, resumeQuality: 0 },
  distanceMiles: null,
  resumeKeywordCount: 0,
  summary: "Enriching match scores…",
  scoringNotes: [],
};

const BASELINE_AI: CandidateAiScore = {
  letterGrade: "C",
  tier: "moderate",
  tierLabel: "Moderate",
  numericScore: 0,
  breakdown: {
    merchandisingKeywords: 0,
    resetExperience: 0,
    walmartTargetExperience: 0,
    travelWillingness: 0,
    yearsOfExperience: 0,
    resumeSourceQuality: 0,
    stageProgression: 0,
    breezyScoreBoost: 0,
  },
  recommendations: [],
  summary: "Enriching scores…",
};

/** Lightweight row for first paint before deferred intelligence scoring. */
export function buildBaselineWorkflowRow(
  candidate: BreezyCandidate,
  local?: CandidateWorkflowRecord,
): ScoredCandidateWorkflowRow {
  const workflowStatus = local?.workflowStatus ?? deriveWorkflowStatus(candidate);
  const assignedDM = local?.assignedDM ?? "Unassigned";
  const suggestedDM = suggestDmForCandidate({
    candidateState: candidate.state,
    jobState: candidate.state,
    assignedDM: local?.assignedDM,
  });
  const intelligenceBundle = buildCandidateIntelligenceBundle(candidate);

  const baseline: ScoredCandidateWorkflowRow = {
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
    paperworkViewedAt: local?.paperworkViewedAt ?? null,
    paperworkViewCount: local?.paperworkViewCount ?? 0,
    paperworkSignedAt: local?.paperworkSignedAt ?? null,
    paperworkStatus: local?.paperworkStatus ?? "not_sent",
    paperworkError: local?.paperworkError ?? null,
    onboardingContactEmail: local?.onboardingContactEmail ?? null,
    directDepositStatus: local?.directDepositStatus ?? "not_requested",
    directDepositRequestedAt: local?.directDepositRequestedAt ?? null,
    directDepositLastReminderAt: local?.directDepositLastReminderAt ?? null,
    directDepositNotes: local?.directDepositNotes ?? null,
    directDepositTriggeredByUserId: local?.directDepositTriggeredByUserId ?? null,
    directDepositLastDeliveryMode: local?.directDepositLastDeliveryMode ?? null,
    directDepositLastHrCopyIncluded: local?.directDepositLastHrCopyIncluded ?? null,
    directDepositLastHrBccAddress: local?.directDepositLastHrBccAddress ?? null,
    suggestedDM,
    dmNeedsAssignment: dmAssignmentNeedsAttention(assignedDM, suggestedDM),
    resumeKeywordScore: null,
    merchandisingExperienceScore: null,
    retailExperienceScore: null,
    travelFitScore: null,
    overallCandidateScore: null,
    aiRecommendation: BASELINE_AI.summary,
    aiGrade: BASELINE_AI.letterGrade,
    aiNumericScore: BASELINE_AI.numericScore,
    aiRecommendations: BASELINE_AI.recommendations,
    aiSummary: BASELINE_AI.summary,
    aiBreakdown: BASELINE_AI.breakdown,
    ai: BASELINE_AI,
    matchPercent: BASELINE_INTELLIGENCE.matchPercent,
    matchLevel: BASELINE_INTELLIGENCE.matchLevel,
    isTopMatch: BASELINE_INTELLIGENCE.isTopMatch,
    hasResume: candidate.hasResume ?? false,
    skillTags: [],
    distanceMiles: null,
    intelligenceSummary: BASELINE_INTELLIGENCE.summary,
    intelligence: BASELINE_INTELLIGENCE,
    resumeIntelligence: intelligenceBundle.resume,
    questionnaireIntelligence: intelligenceBundle.questionnaire,
    candidateGrade: baselineCandidateReadinessScore(),
  };
  return {
    ...baseline,
    nextActionNeeded: resolveRecruiterNextAction(baseline, workflowStatus, local?.nextActionNeeded),
  };
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
  const intelligenceBundle = buildCandidateIntelligenceBundle(candidate);

  const scored: ScoredCandidateWorkflowRow = {
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
    paperworkViewedAt: local?.paperworkViewedAt ?? null,
    paperworkViewCount: local?.paperworkViewCount ?? 0,
    paperworkSignedAt: local?.paperworkSignedAt ?? null,
    paperworkStatus: local?.paperworkStatus ?? "not_sent",
    paperworkError: local?.paperworkError ?? null,
    onboardingContactEmail: local?.onboardingContactEmail ?? null,
    directDepositStatus: local?.directDepositStatus ?? "not_requested",
    directDepositRequestedAt: local?.directDepositRequestedAt ?? null,
    directDepositLastReminderAt: local?.directDepositLastReminderAt ?? null,
    directDepositNotes: local?.directDepositNotes ?? null,
    directDepositTriggeredByUserId: local?.directDepositTriggeredByUserId ?? null,
    directDepositLastDeliveryMode: local?.directDepositLastDeliveryMode ?? null,
    directDepositLastHrCopyIncluded: local?.directDepositLastHrCopyIncluded ?? null,
    directDepositLastHrBccAddress: local?.directDepositLastHrBccAddress ?? null,
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
    resumeIntelligence: intelligenceBundle.resume,
    questionnaireIntelligence: intelligenceBundle.questionnaire,
    candidateGrade: intelligenceBundle.grade,
  };
  return {
    ...scored,
    nextActionNeeded: resolveRecruiterNextAction(scored, workflowStatus, local?.nextActionNeeded),
  };
}
