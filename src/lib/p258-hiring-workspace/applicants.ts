import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  CandidateWorkflowRecord,
  CandidateWorkflowState,
} from "@/lib/candidate-workflow-types";
import { filterApplicantsForBreezyJob } from "@/lib/p257-job-command-center";
import { resolveApplicantDistanceMiles } from "@/lib/p257-job-command-center";
import { mapEligibilityFromApplicantInput } from "@/lib/p258-hiring-workspace/eligibility";
import {
  computeHiringScore,
  isReadyForPaperwork,
} from "@/lib/p258-hiring-workspace/hiring-score";
import { formatDropboxSignStatus } from "@/lib/p258-hiring-workspace/pipeline";
import { sortHiringWorkspaceApplicants } from "@/lib/p258-hiring-workspace/sort-applicants";
import type {
  HiringWorkspaceApplicantInput,
  HiringWorkspaceApplicantRow,
} from "@/lib/p258-hiring-workspace/types";
import type { BreezyJob } from "@/lib/breezy-api";

export function toHiringWorkspaceApplicantInput(
  candidate: BreezyCandidate,
  workflow?: CandidateWorkflowRecord,
): HiringWorkspaceApplicantInput {
  const row = buildBaselineWorkflowRow(candidate, workflow);
  return {
    candidateId: row.candidateId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    positionId: row.positionId,
    positionName: row.positionName,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    stage: row.stage,
    appliedDate: row.appliedDate,
    updatedDate: row.updatedDate,
    workflowStatus: row.workflowStatus,
    distanceMiles: row.distanceMiles,
    assignedRecruiter: row.assignedRecruiter,
    assignedDM: row.assignedDM,
    recruiterAssignmentSource: workflow?.recruiterAssignmentSource ?? null,
    recruiterAssignedAt: workflow?.recruiterAssignedAt ?? null,
    recruiterAssignedBy: workflow?.recruiterAssignedBy ?? null,
    recruiterConfirmationStatus: workflow?.recruiterConfirmationStatus ?? null,
    dmAssignmentSource: workflow?.dmAssignmentSource ?? null,
    dmAssignedAt: workflow?.dmAssignedAt ?? null,
    dmAssignedBy: workflow?.dmAssignedBy ?? null,
    paperworkStatus: row.paperworkStatus,
    paperworkTemplateKey: row.paperworkTemplateKey,
    signatureRequestId: row.signatureRequestId,
    paperworkSentAt: row.paperworkSentAt,
    paperworkSignedAt: row.paperworkSignedAt,
    paperworkViewedAt: row.paperworkViewedAt,
    paperworkError: row.paperworkError,
    lastActionAt: row.lastActionAt,
    notes: row.notes,
    history: row.history,
    actionType: row.actionType,
    nextActionNeeded: row.nextActionNeeded,
    source: row.source,
    hasResume: row.hasResume,
    recommendInterview: Boolean(row.recruitingActions?.recommendInterview),
  };
}

export function buildHiringWorkspaceApplicantInputs(input: {
  breezyJobId: string;
  jobTitle?: string;
  candidates: BreezyCandidate[];
  workflows?: CandidateWorkflowState;
}): HiringWorkspaceApplicantInput[] {
  const matched = filterApplicantsForBreezyJob(input.candidates, {
    jobId: input.breezyJobId,
    name: input.jobTitle,
  });
  return matched.map((candidate) =>
    toHiringWorkspaceApplicantInput(candidate, input.workflows?.[candidate.candidateId]),
  );
}

export function buildHiringWorkspaceApplicantRow(
  applicant: HiringWorkspaceApplicantInput,
  jobLocation: { city: string; state: string },
  options?: {
    jobsByPositionId?: Map<string, BreezyJob>;
  },
): HiringWorkspaceApplicantRow {
  const distanceMiles = resolveApplicantDistanceMiles(applicant, jobLocation);
  const scoredInput: HiringWorkspaceApplicantInput = {
    ...applicant,
    distanceMiles,
  };
  const { score, reasons } = computeHiringScore(scoredInput);
  const eligibility = mapEligibilityFromApplicantInput(scoredInput, {
    jobsByPositionId: options?.jobsByPositionId,
  });
  const name = `${applicant.firstName ?? ""} ${applicant.lastName ?? ""}`.trim();

  return {
    candidateId: applicant.candidateId,
    displayName: name || applicant.email || applicant.candidateId,
    firstName: applicant.firstName ?? "",
    lastName: applicant.lastName ?? "",
    hiringScore: score,
    hiringScoreReasons: reasons,
    distanceMiles,
    appliedDate: applicant.appliedDate ?? "",
    breezyStage: applicant.stage ?? "",
    workflowStatus: applicant.workflowStatus,
    paperworkStatus: applicant.paperworkStatus ?? "not_sent",
    dropboxSignStatus: formatDropboxSignStatus({
      paperworkStatus: applicant.paperworkStatus,
      signatureRequestId: applicant.signatureRequestId,
    }),
    signatureRequestId: applicant.signatureRequestId ?? null,
    paperworkTemplateKey: applicant.paperworkTemplateKey ?? null,
    recruiter: applicant.assignedRecruiter?.trim() || "Unassigned",
    dm: applicant.assignedDM?.trim() || "Unassigned",
    recruiterAssignmentSource: applicant.recruiterAssignmentSource ?? null,
    recruiterAssignedAt: applicant.recruiterAssignedAt ?? null,
    recruiterAssignedBy: applicant.recruiterAssignedBy ?? null,
    recruiterConfirmationStatus: applicant.recruiterConfirmationStatus ?? null,
    dmAssignmentSource: applicant.dmAssignmentSource ?? null,
    dmAssignedAt: applicant.dmAssignedAt ?? null,
    dmAssignedBy: applicant.dmAssignedBy ?? null,
    email: applicant.email ?? "",
    phone: applicant.phone ?? "",
    lastActivity: applicant.lastActionAt || applicant.updatedDate || applicant.appliedDate || null,
    city: applicant.city ?? "",
    state: applicant.state ?? "",
    zipCode: applicant.zipCode ?? "",
    positionId: applicant.positionId,
    positionName: applicant.positionName ?? "",
    source: applicant.source ?? "",
    hasResume: Boolean(applicant.hasResume),
    nextActionNeeded: applicant.nextActionNeeded ?? "",
    notes: applicant.notes ?? [],
    history: applicant.history ?? [],
    paperworkSentAt: applicant.paperworkSentAt ?? null,
    paperworkSignedAt: applicant.paperworkSignedAt ?? null,
    paperworkViewedAt: applicant.paperworkViewedAt ?? null,
    paperworkError: applicant.paperworkError ?? null,
    readyForPaperwork: isReadyForPaperwork(scoredInput),
    eligibility,
  };
}

export function buildHiringWorkspaceApplicantRows(
  applicants: HiringWorkspaceApplicantInput[],
  jobLocation: { city: string; state: string },
  options?: {
    jobsByPositionId?: Map<string, BreezyJob>;
  },
): HiringWorkspaceApplicantRow[] {
  const rows = applicants.map((applicant) =>
    buildHiringWorkspaceApplicantRow(applicant, jobLocation, options),
  );
  return sortHiringWorkspaceApplicants(rows);
}
