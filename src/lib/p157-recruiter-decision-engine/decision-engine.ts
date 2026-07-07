import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import { evaluateP157ActionRule } from "@/lib/p157-recruiter-decision-engine/action-rules";
import {
  buildDecisionSignals,
  computeDecisionConfidence,
} from "@/lib/p157-recruiter-decision-engine/confidence-score";
import { buildDecisionReasoning } from "@/lib/p157-recruiter-decision-engine/explanation-generator";
import type {
  P157CandidateDecision,
  P157DecisionContext,
} from "@/lib/p157-recruiter-decision-engine/types";
import type { P156PrioritizedCandidate } from "@/lib/p156-candidate-prioritization/types";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";

function candidateDisplayName(row: ScoredCandidateWorkflowRow): string {
  const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return name || row.email?.trim() || row.candidateId;
}

export function buildP157DecisionContext(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  onboarding: CandidateOnboardingRecord | null;
  auditEvents: PaperworkAutomationAuditEvent[];
  scoringMeta: {
    openDemand: number;
    coverageStatus: string;
    daysUntilProjectStart: number | null;
    projectName: string | null;
    jobStatus: string | null;
    jobPublished: boolean;
  };
  recruiterWorkload: number;
  referenceMs: number;
}): P157DecisionContext {
  const { row, candidate, onboarding, auditEvents, scoringMeta, recruiterWorkload, referenceMs } =
    input;

  const duplicateReason = duplicatePaperworkSendBlockReason({ activeOnboarding: onboarding ?? undefined });
  const notesDuplicate = (row.notes ?? []).some((n) => /duplicate/i.test(n));
  const gradeDuplicate = row.candidateGrade.gradeContributors.some((c) =>
    /duplicate/i.test(c.label),
  );
  const isDuplicate = Boolean(duplicateReason || notesDuplicate || gradeDuplicate);

  const hard = detectImmediatePaperworkHardBlockers({
    row,
    candidate,
    onboarding,
    auditEvents,
  });
  const paperworkEligible = !hard.blocked;
  const review = evaluateApplicantReview(row);

  return {
    referenceMs,
    openDemand: scoringMeta.openDemand,
    coverageStatus: scoringMeta.coverageStatus,
    daysUntilProjectStart: scoringMeta.daysUntilProjectStart,
    projectName: scoringMeta.projectName,
    recruiterWorkload,
    jobPublished: scoringMeta.jobPublished,
    jobStatus: scoringMeta.jobStatus,
    isDuplicate,
    duplicateReason: duplicateReason ?? (notesDuplicate || gradeDuplicate ? "Duplicate candidate flagged" : null),
    paperworkEligible,
    paperworkBlockers: hard.blockers,
    applicantVerdict: review.verdict,
    missingDocuments: review.missingItems,
    questionnaireComplete: row.questionnaireIntelligence.available,
    questionnaireTechReady: row.questionnaireIntelligence.techReady,
  };
}

export function decideCandidateAction(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  onboarding: CandidateOnboardingRecord | null;
  auditEvents: PaperworkAutomationAuditEvent[];
  priority: P156PrioritizedCandidate;
  scoringMeta: {
    openDemand: number;
    coverageStatus: string;
    daysUntilProjectStart: number | null;
    projectName: string | null;
    jobStatus: string | null;
    jobPublished: boolean;
  };
  recruiterWorkload: number;
  referenceMs: number;
}): P157CandidateDecision {
  const ctx = buildP157DecisionContext(input);
  const paperworkStage = classifyPaperworkStage({ row: input.row, onboarding: input.onboarding });
  const rule = evaluateP157ActionRule({
    row: input.row,
    ctx,
    paperworkStage,
  });

  const signals = buildDecisionSignals(rule.signals);
  const confidence = computeDecisionConfidence({
    action: rule.action,
    signals,
    priorityScore: input.priority.priorityScore,
    paperworkEligible: ctx.paperworkEligible,
    recruiterAssigned: input.priority.recruiter !== "Unassigned",
    questionnaireComplete: ctx.questionnaireComplete,
    noDuplicate: !ctx.isDuplicate,
    urgentProject: ctx.coverageStatus === "Critical" || ctx.coverageStatus === "At Risk",
  });

  const reasoning = buildDecisionReasoning({ action: rule.action, signals: rule.signals });

  return {
    candidateId: input.row.candidateId,
    candidateName: candidateDisplayName(input.row),
    email: input.row.email?.trim() || null,
    action: rule.action,
    confidence,
    reasoning,
    recruiter: input.priority.recruiter,
    dm: input.priority.dm,
    position: input.priority.position,
    positionId: input.priority.positionId,
    project: input.priority.project,
    territory: input.priority.territory,
    state: input.priority.state,
    workflowStatus: input.priority.workflowStatus,
    priorityScore: input.priority.priorityScore,
    priorityLevel: input.priority.priorityLevel,
    openDemand: input.priority.openDemand,
    daysInPipeline: input.priority.daysInPipeline,
    signals,
  };
}
