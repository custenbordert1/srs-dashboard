import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";
import type { ImmediatePaperworkHardBlocker } from "@/lib/p152-immediate-paperwork-policy/types";

const ARCHIVED_HINTS = ["archived", "withdrawn", "rejected"];
const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL", "Ready for MEL"]);

function hasAuditSend(auditEvents: PaperworkAutomationAuditEvent[], candidateId: string): boolean {
  return auditEvents.some(
    (event) =>
      event.candidateId === candidateId &&
      event.sendResult === "sent" &&
      (event.recommendedAction === "Send Initial Paperwork" ||
        event.type === "paperwork_sent" ||
        event.type === "initial_paperwork_sent"),
  );
}

export type ImmediateHardBlockerResult = {
  blocked: boolean;
  blockers: string[];
  primaryHardBlocker: ImmediatePaperworkHardBlocker | null;
};

export function detectImmediatePaperworkHardBlockers(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  onboarding: CandidateOnboardingRecord | null;
  auditEvents: PaperworkAutomationAuditEvent[];
}): ImmediateHardBlockerResult {
  const { row, candidate, onboarding, auditEvents } = input;
  const blockers: string[] = [];

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    return {
      blocked: true,
      blockers: ["Recruiter not assigned."],
      primaryHardBlocker: "unassigned_recruiter",
    };
  }

  const email = row.email?.trim() || candidate.email?.trim();
  if (!email) {
    return {
      blocked: true,
      blockers: ["Invalid or missing email."],
      primaryHardBlocker: "invalid_email",
    };
  }

  const duplicateReason = duplicatePaperworkSendBlockReason({ activeOnboarding: onboarding ?? undefined });
  const notesDuplicate = (row.notes ?? []).some((n) => /duplicate/i.test(n));
  const gradeDuplicate = row.candidateGrade.gradeContributors.some((c) =>
    /duplicate/i.test(c.label),
  );
  if (duplicateReason || notesDuplicate || gradeDuplicate || hasAuditSend(auditEvents, row.candidateId)) {
    return {
      blocked: true,
      blockers: [duplicateReason ?? "Duplicate candidate flagged."],
      primaryHardBlocker: "duplicate_candidate",
    };
  }

  if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
    return {
      blocked: true,
      blockers: ["Paperwork already completed."],
      primaryHardBlocker: "paperwork_already_completed",
    };
  }

  if (
    row.signatureRequestId &&
    (row.paperworkStatus === "sent" ||
      row.paperworkStatus === "viewed" ||
      row.workflowStatus === "Paperwork Sent")
  ) {
    return {
      blocked: true,
      blockers: ["Active signature request already exists."],
      primaryHardBlocker: "active_signature_request",
    };
  }

  if (
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.workflowStatus === "Paperwork Sent"
  ) {
    return {
      blocked: true,
      blockers: ["Paperwork already sent."],
      primaryHardBlocker: "paperwork_already_sent",
    };
  }

  const review = evaluateApplicantReview(row);
  if (review.verdict === "disqualified" || row.workflowStatus === "Not Qualified") {
    return {
      blocked: true,
      blockers: [review.summary || "Candidate disqualified."],
      primaryHardBlocker: "disqualified_candidate",
    };
  }

  if (TERMINAL_STATUSES.has(row.workflowStatus)) {
    blockers.push(`Terminal status: ${row.workflowStatus}.`);
  }
  const haystack = `${row.workflowStatus} ${row.stage} ${candidate.stage}`.toLowerCase();
  if (ARCHIVED_HINTS.some((hint) => haystack.includes(hint))) {
    blockers.push("Archived or withdrawn candidate.");
  }
  if (blockers.length > 0) {
    return {
      blocked: true,
      blockers,
      primaryHardBlocker: "archived_candidate",
    };
  }

  return { blocked: false, blockers: [], primaryHardBlocker: null };
}
