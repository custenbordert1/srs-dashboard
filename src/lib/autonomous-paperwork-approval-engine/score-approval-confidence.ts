import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import type { ApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";

export type ApprovalScoreInput = {
  row: ScoredCandidateWorkflowRow | null;
  templateKey: string | null;
  mappingConfidence: number;
  approvedMapping: ApprovedMappingResolution | null;
  p109Record: P109ReviewDecisionRecord | null;
  nativePublishedJob: boolean;
  alreadySent: boolean;
  duplicateRisk: boolean;
  candidateAgeDays: number;
  policy: ApprovalPolicy;
};

export type ApprovalScoreBreakdown = {
  score: number;
  approvalReasons: string[];
  safetyReasons: string[];
  factors: Record<string, number>;
};

export function scoreApprovalConfidence(input: ApprovalScoreInput): ApprovalScoreBreakdown {
  const factors: Record<string, number> = {};
  const approvalReasons: string[] = [];
  const safetyReasons: string[] = [];
  let score = 0;

  const email = input.row?.email?.trim() ?? "";
  const emailValid = Boolean(email) && validateCohortEmail(email).valid;
  if (emailValid) {
    factors.validEmail = 10;
    score += 10;
    approvalReasons.push("Valid email");
  } else if (!email) {
    safetyReasons.push("Missing candidate email");
  } else {
    safetyReasons.push("Invalid email");
  }

  if (!input.duplicateRisk) {
    factors.noDuplicateRisk = 10;
    score += 10;
    approvalReasons.push("No duplicate risk");
  } else {
    safetyReasons.push("Duplicate risk detected");
  }

  if (!input.alreadySent) {
    factors.noAlreadySent = 10;
    score += 10;
    approvalReasons.push("No already_sent record");
  } else {
    safetyReasons.push("Paperwork already sent");
  }

  if (input.nativePublishedJob) {
    factors.publishedJob = 15;
    score += 15;
    approvalReasons.push("Published active job");
  }

  if (input.approvedMapping?.qualifies) {
    factors.approvedMapping = 15;
    score += 15;
    approvalReasons.push("Approved mapping");
  } else if (input.nativePublishedJob) {
    factors.nativeProject = 10;
    score += 10;
    approvalReasons.push("Native active project match");
  }

  const questionnaireComplete = Boolean(input.row?.hasResume && input.row?.candidateGrade?.paperworkReady !== false);
  if (questionnaireComplete) {
    factors.questionnaire = 10;
    score += 10;
    approvalReasons.push("Questionnaire complete");
  }

  const statusOk =
    input.row &&
    !["Not Qualified", "Signed", "Active Rep"].includes(input.row.workflowStatus) &&
    input.row.paperworkStatus === "not_sent";
  if (statusOk) {
    factors.candidateStatus = 5;
    score += 5;
    approvalReasons.push("Candidate status eligible");
  }

  if (input.nativePublishedJob || input.approvedMapping?.qualifies) {
    factors.coverageNeed = 5;
    score += 5;
    approvalReasons.push("Project coverage need");
  }

  const mappingPoints = Math.min(10, Math.round(input.mappingConfidence / 10));
  if (mappingPoints > 0) {
    factors.mappingConfidence = mappingPoints;
    score += mappingPoints;
    approvalReasons.push(`Mapping confidence ${input.mappingConfidence}%`);
  }

  const freshnessPoints = Math.min(5, Math.round(Math.min(input.candidateAgeDays, 14) / 3));
  if (freshnessPoints > 0) {
    factors.freshness = freshnessPoints;
    score += freshnessPoints;
  }

  if (input.row && !isUnassignedRecruiter(input.row.assignedRecruiter)) {
    factors.recruiter = 5;
    score += 5;
    approvalReasons.push("Recruiter assigned");
  }
  if (input.row?.assignedDM?.trim()) {
    factors.dm = 5;
    score += 5;
    approvalReasons.push("DM assigned");
  }

  if (input.templateKey) {
    factors.template = 10;
    score += 10;
    approvalReasons.push("Template available");
  } else {
    safetyReasons.push("Missing template");
  }

  if (input.p109Record?.decision === "rejected") {
    safetyReasons.push("Rejected mapping");
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    approvalReasons,
    safetyReasons,
    factors,
  };
}
