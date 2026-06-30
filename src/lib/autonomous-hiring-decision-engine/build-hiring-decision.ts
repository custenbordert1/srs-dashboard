import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { DEFAULT_HIRING_DECISION_RULES } from "@/lib/autonomous-hiring-decision-engine/hiring-decision-rules";
import type {
  HiringDecision,
  HiringDecisionConfidence,
  HiringDecisionExplanation,
  HiringDecisionRules,
  HiringRecommendationAction,
} from "@/lib/autonomous-hiring-decision-engine/types";
import { HIRING_RECOMMENDATION_LABELS } from "@/lib/autonomous-hiring-decision-engine/types";

function hasContributor(row: ScoredCandidateWorkflowRow, fragment: string): boolean {
  return row.candidateGrade.gradeContributors.some((item) =>
    item.label.toLowerCase().includes(fragment.toLowerCase()),
  );
}

function hasPublishedJob(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
): boolean {
  return Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
}

function hasActivePaperwork(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

function negativeContributors(row: ScoredCandidateWorkflowRow): string[] {
  return row.candidateGrade.gradeContributors
    .filter((item) => item.kind === "negative")
    .map((item) => item.label);
}

function confidenceScore(confidence: HiringDecisionConfidence): number {
  switch (confidence) {
    case "high":
      return 0.9;
    case "medium":
      return 0.65;
    default:
      return 0.35;
  }
}

function candidateName(row: ScoredCandidateWorkflowRow): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : row.email || row.candidateId;
}

function recruiterActionFor(action: HiringRecommendationAction, row: ScoredCandidateWorkflowRow): string {
  const name = candidateName(row);
  switch (action) {
    case "fast_track":
      return "Approve fast-track path and prepare paperwork packet (preview only until P88).";
    case "recruiter_review":
      return `Call ${name} to validate fit, availability, and employment history.`;
    case "hold":
      return "Pause automation until blockers are resolved; assign follow-up task.";
    case "reject":
      return "Send disqualification notice and archive candidate in Breezy.";
    case "missing_information":
      return "Request missing resume and/or questionnaire before scoring.";
    default:
      return "Review candidate manually.";
  }
}

function statusLabel(action: HiringRecommendationAction): string {
  switch (action) {
    case "fast_track":
      return "FAST TRACK";
    case "recruiter_review":
      return "RECRUITER REVIEW";
    case "hold":
      return "HOLD";
    case "reject":
      return "REJECT";
    case "missing_information":
      return "MISSING INFORMATION";
  }
}

function buildExplanation(input: {
  action: HiringRecommendationAction;
  row: ScoredCandidateWorkflowRow;
  positiveFactors: string[];
  negativeFactors: string[];
  missingData: string[];
  reasoningBullets: string[];
  rules: HiringDecisionRules;
}): HiringDecisionExplanation {
  const confidence = input.row.candidateGrade.confidence as HiringDecisionConfidence;
  return {
    overallRecommendation: input.action,
    recommendationLabel: HIRING_RECOMMENDATION_LABELS[input.action],
    confidence,
    confidenceScore: confidenceScore(confidence),
    positiveFactors: input.positiveFactors,
    negativeFactors: input.negativeFactors,
    missingData: input.missingData,
    recommendedRecruiterAction: recruiterActionFor(input.action, input.row),
    estimatedTimeSavedMinutes: input.rules.timeSavedMinutes[input.action],
    reasoningBullets: [
      `Status: ${statusLabel(input.action)}`,
      ...input.reasoningBullets,
    ],
  };
}

export function buildHiringDecision(input: {
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding?: CandidateOnboardingRecord | null;
  rules?: HiringDecisionRules;
  generatedAt?: string;
}): HiringDecision {
  const rules = input.rules ?? DEFAULT_HIRING_DECISION_RULES;
  const { row } = input;
  const review = evaluateApplicantReview(row);
  const grade = row.candidateGrade;
  const positives: string[] = [...grade.strengths];
  const negatives: string[] = [...grade.concerns];
  const missing: string[] = [...review.missingItems, ...review.unknownItems];
  const bullets: string[] = [];
  let action: HiringRecommendationAction = "recruiter_review";

  const resumeUnavailable = !row.resumeIntelligence.available;
  const questionnaireUnavailable = !row.questionnaireIntelligence.available;
  const publishedJob = hasPublishedJob(row, input.jobsByPositionId);
  const negCount = negativeContributors(row).length;
  const transportNotConfirmed = hasContributor(row, "Transportation not confirmed");
  const noTransportation =
    questionnaireUnavailable === false &&
    (transportNotConfirmed ||
      row.questionnaireIntelligence.answers.some(
        (a) =>
          a.question.toLowerCase().includes("transportation") &&
          /^(no|false|none)$/i.test(a.answer.trim()),
      ));
  const smartphoneMissing =
    questionnaireUnavailable === false && row.questionnaireIntelligence.smartphoneAccess === false;
  const duplicateBlock = duplicatePaperworkSendBlockReason({
    workflow: {
      candidateId: row.candidateId,
      paperworkStatus: row.paperworkStatus,
      workflowStatus: row.workflowStatus,
      signatureRequestId: row.signatureRequestId,
    } as never,
    activeOnboarding: input.onboarding ?? null,
  });
  const alreadyHired = rules.hold.holdOnAlreadyHired.includes(row.workflowStatus);
  const closedJob = rules.hold.holdOnClosedJob && !publishedJob && Boolean(row.positionId?.trim());
  const missingResume = rules.hold.holdOnMissingResume && !row.hasResume;
  const missingQuestionnaire = rules.hold.holdOnMissingQuestionnaire && questionnaireUnavailable;
  const disqualified =
    rules.reject.disqualifyingGrades.includes(grade.grade) ||
    rules.reject.rejectTerminalStatuses.includes(row.workflowStatus) ||
    review.verdict === "disqualified";

  if (grade.paperworkReady) positives.push("Ready for paperwork");
  if (row.resumeIntelligence.available && row.resumeIntelligence.workHistoryHighlights.length > 0) {
    positives.push("Strong work history");
  }
  if (row.questionnaireIntelligence.available && grade.techReady === true) {
    positives.push("Strong questionnaire");
  }

  if (
    rules.missingInformation.requireBothResumeAndQuestionnaireUnavailable &&
    resumeUnavailable &&
    questionnaireUnavailable
  ) {
    action = "missing_information";
    bullets.push("• Resume unavailable");
    bullets.push("• Questionnaire unavailable");
    bullets.push("• Incomplete application");
  } else if (disqualified) {
    action = "reject";
    if (grade.grade === "D") bullets.push(`Grade ${grade.grade} disqualified`);
    if (row.workflowStatus === "Not Qualified") bullets.push("Workflow status: Not Qualified");
    if (negatives.length) bullets.push(...negatives.slice(0, 2).map((n) => `• ${n}`));
  } else if (rules.reject.rejectOnNoTransportation && noTransportation) {
    action = "reject";
    bullets.push("• No reliable transportation confirmed");
    negatives.push("No transportation");
  } else if (smartphoneMissing) {
    action = "reject";
    bullets.push("• Smartphone access not confirmed");
    negatives.push("No smartphone");
  } else if (alreadyHired) {
    action = "hold";
    bullets.push(`• Candidate already at stage: ${row.workflowStatus}`);
  } else if (closedJob) {
    action = "hold";
    bullets.push("• Position closed or unpublished");
    negatives.push("Closed position");
  } else if (rules.hold.holdOnDuplicatePaperwork && duplicateBlock) {
    action = "hold";
    bullets.push(`• ${duplicateBlock}`);
    negatives.push("Duplicate paperwork risk");
  } else if (hasActivePaperwork(row)) {
    action = "hold";
    bullets.push("• Paperwork already in flight");
  } else if (missingResume && missingQuestionnaire) {
    action = "missing_information";
    bullets.push("• Resume not uploaded");
    bullets.push("• Questionnaire not completed");
  } else if (missingResume) {
    action = "hold";
    bullets.push("• Missing resume");
    missing.push("Resume not uploaded");
  } else if (missingQuestionnaire) {
    action = "hold";
    bullets.push("• Missing questionnaire");
    missing.push("Questionnaire not completed");
  } else if (
    rules.fastTrack.allowedGrades.includes(grade.grade) &&
    rules.fastTrack.allowedConfidence.includes(grade.confidence as HiringDecisionConfidence) &&
    (!rules.fastTrack.requireResume || row.hasResume) &&
    (!rules.fastTrack.requireQuestionnaire || row.questionnaireIntelligence.available) &&
    (!rules.fastTrack.requireTransportationConfirmed || !transportNotConfirmed) &&
    (!rules.fastTrack.requireSmartphoneConfirmed || row.questionnaireIntelligence.smartphoneAccess !== false) &&
    negCount <= rules.fastTrack.maxNegativeContributors &&
    (!rules.fastTrack.requirePublishedJob || publishedJob) &&
    (review.verdict === "qualified" || (grade.grade === "B" && grade.confidence === "high"))
  ) {
    action = "fast_track";
    if (row.questionnaireIntelligence.available) bullets.push("• Strong questionnaire");
    if (row.resumeIntelligence.available) bullets.push("• Strong work history");
    bullets.push("• Ready for paperwork");
  } else if (review.verdict === "incomplete" || grade.confidence === "low" || grade.grade === "C") {
    action = "recruiter_review";
    if (grade.confidence === "medium") bullets.push("• Medium confidence score");
    if (grade.grade === "C") bullets.push(`• Grade ${grade.grade} needs validation`);
    if (review.missingItems.length) bullets.push(`• Gaps: ${review.missingItems.join(", ")}`);
    bullets.push("• Needs recruiter phone call");
  } else {
    action = "recruiter_review";
    bullets.push(`• Grade ${grade.grade} (${grade.confidence} confidence)`);
    bullets.push("• Mixed signals — recruiter validation recommended");
  }

  return {
    candidateId: row.candidateId,
    candidateName: candidateName(row),
    email: row.email ?? "",
    positionName: row.positionName ?? "",
    workflowStatus: row.workflowStatus,
    grade: grade.grade,
    candidateGrade: grade.grade,
    confidence: grade.confidence as HiringDecisionConfidence,
    action,
    explanation: buildExplanation({
      action,
      row,
      positiveFactors: positives,
      negativeFactors: negatives,
      missingData: missing,
      reasoningBullets: bullets,
      rules,
    }),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

export function buildHiringDecisions(input: {
  rows: ScoredCandidateWorkflowRow[];
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId?: Map<string, CandidateOnboardingRecord>;
  rules?: HiringDecisionRules;
  generatedAt?: string;
}): HiringDecision[] {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  return input.rows.map((row) =>
    buildHiringDecision({
      row,
      jobsByPositionId: input.jobsByPositionId,
      onboarding: input.onboardingByCandidateId?.get(row.candidateId) ?? null,
      rules: input.rules,
      generatedAt,
    }),
  );
}
