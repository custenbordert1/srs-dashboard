import { isValidP245Email } from "@/lib/p245-onboarding-paperwork-reminders/eligibility";
import type { P246CandidateEvaluation, P246PreviewReport } from "@/lib/p246-outstanding-paperwork-reminders/types";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import type {
  P248CleanupInvalidEmail,
  P248CleanupMissingSignature,
} from "@/lib/p248-resend-live-reminder-campaign/types";

function storeHint(positionName: string | null): string | null {
  if (!positionName) return null;
  // Position names often include city/store context after an em dash or hyphen.
  const parts = positionName.split(/[–—-]/);
  if (parts.length >= 2) return parts[parts.length - 1]!.trim() || null;
  return positionName;
}

export async function buildInvalidEmailCleanup(
  evaluations: P246CandidateEvaluation[],
): Promise<P248CleanupInvalidEmail[]> {
  const [workflows, ingestion] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
  ]);
  const byId = new Map(listIngestedCandidates(ingestion).map((c) => [c.candidateId, c]));
  const rows = evaluations.filter((e) => e.eligibilityResult === "invalid_email");
  return rows.map((row) => {
    const wf = workflows[row.candidateId];
    const cand = byId.get(row.candidateId);
    const breezyEmail = cand?.email?.trim() || null;
    const alt =
      breezyEmail &&
      breezyEmail.toLowerCase() !== (row.email ?? "").toLowerCase() &&
      isValidP245Email(breezyEmail)
        ? breezyEmail.toLowerCase()
        : null;
    return {
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      invalidEmail: row.email,
      breezyPosition: row.breezyPosition ?? cand?.positionName ?? null,
      store: storeHint(row.breezyPosition ?? cand?.positionName ?? null),
      recruiter: wf?.assignedRecruiter ?? null,
      districtManager: wf?.assignedDM ?? null,
      alternateValidEmail: alt,
      recommendedCorrection: alt
        ? `Update onboardingContactEmail to alternate Breezy email ${alt}`
        : "Obtain a valid candidate email in Breezy / workflow before any reminder",
    };
  });
}

export async function buildMissingSignatureCleanup(
  evaluations: P246CandidateEvaluation[],
): Promise<P248CleanupMissingSignature[]> {
  const rows = evaluations.filter((e) => e.eligibilityResult === "missing_signature_request");
  return rows.map((row) => {
    const neverCreated =
      row.paperworkStatus === "not_sent" ||
      (row.workflowStatus !== "Paperwork Sent" && !row.signatureRequestId);
    const stale =
      row.workflowStatus === "Paperwork Sent" ||
      row.paperworkStatus === "sent" ||
      row.paperworkStatus === "viewed";
    return {
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      workflowStage: row.workflowStatus,
      paperworkStatus: row.paperworkStatus,
      currentEmail: row.email,
      dropboxRequestFoundByEmail: null, // not auto-searched — requires separate Dropbox recovery
      packetNeverCreated: neverCreated ? true : stale ? false : null,
      internalDataStale: stale,
      recommendedRecoveryAction: stale
        ? "Investigate stale Paperwork Sent without signatureRequestId; recover Dropbox request by email or re-send packet via controlled paperwork flow (not P248 reminders)"
        : "Create/send onboarding packet via approved paperwork send path before reminders",
    };
  });
}

export async function buildP248CleanupReports(preview: P246PreviewReport): Promise<{
  invalidEmails: P248CleanupInvalidEmail[];
  missingSignatureRequests: P248CleanupMissingSignature[];
}> {
  const [invalidEmails, missingSignatureRequests] = await Promise.all([
    buildInvalidEmailCleanup(preview.evaluations),
    buildMissingSignatureCleanup(preview.evaluations),
  ]);
  return { invalidEmails, missingSignatureRequests };
}
