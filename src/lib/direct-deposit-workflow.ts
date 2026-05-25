import { getSignatureRequest } from "@/lib/dropbox-sign";
import {
  buildDirectDepositVerificationEmailBody,
  buildDirectDepositVerificationEmailHtml,
} from "@/lib/direct-deposit-email-copy";
import {
  DIRECT_DEPOSIT_EMAIL_SUBJECT,
  DIRECT_DEPOSIT_HR_EMAIL,
  type DirectDepositStatus,
} from "@/lib/direct-deposit-types";
import { sendTransactionalEmail } from "@/lib/transactional-email";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";

function hrFromAddress(): string {
  return process.env.DIRECT_DEPOSIT_FROM?.trim() || DIRECT_DEPOSIT_HR_EMAIL;
}

function hrReplyTo(): string {
  return process.env.DIRECT_DEPOSIT_REPLY_TO?.trim() || DIRECT_DEPOSIT_HR_EMAIL;
}

export async function resolveOnboardingContactEmail(input: {
  workflow: CandidateWorkflowRecord;
  signatureRequestId?: string | null;
  overrideEmail?: string | null;
}): Promise<string | null> {
  const override = input.overrideEmail?.trim();
  if (override) return override;
  const stored = input.workflow.onboardingContactEmail?.trim();
  if (stored) return stored;
  const sigId = input.signatureRequestId ?? input.workflow.signatureRequestId;
  if (!sigId) return null;
  try {
    const summary = await getSignatureRequest(sigId);
    const email = summary.signatures.map((s) => s.signerEmail.trim()).find(Boolean);
    return email ?? null;
  } catch {
    return null;
  }
}

async function sendDirectDepositVerificationEmail(input: {
  to: string;
  candidateId: string;
  resend: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const text = buildDirectDepositVerificationEmailBody();
  const result = await sendTransactionalEmail(
    {
      from: hrFromAddress(),
      replyTo: hrReplyTo(),
      to: input.to,
      subject: DIRECT_DEPOSIT_EMAIL_SUBJECT,
      text,
      html: buildDirectDepositVerificationEmailHtml(),
      tags: ["direct-deposit", input.resend ? "resend" : "initial"],
    },
    { candidateId: input.candidateId, kind: "direct_deposit_verification" },
  );
  return { ok: result.ok, error: result.error };
}

export type DirectDepositWorkflowResult = {
  workflow: CandidateWorkflowRecord;
  emailSent: boolean;
  skipped?: string;
};

/** After paperwork signed: request DD verification once (idempotent). */
export async function requestDirectDepositAfterPaperworkSigned(input: {
  workflow: CandidateWorkflowRecord;
  recipientEmail?: string | null;
  signatureRequestId?: string | null;
  byUserId?: string;
}): Promise<DirectDepositWorkflowResult> {
  if (input.workflow.directDepositStatus !== "not_requested") {
    return {
      workflow: input.workflow,
      emailSent: false,
      skipped: "already_requested",
    };
  }

  const email = await resolveOnboardingContactEmail({
    workflow: input.workflow,
    signatureRequestId: input.signatureRequestId,
    overrideEmail: input.recipientEmail,
  });

  if (!email) {
    const workflow = await upsertCandidateWorkflow({
      candidateId: input.workflow.candidateId,
      workflowStatus: input.workflow.workflowStatus,
      onboardingContactEmail: input.workflow.onboardingContactEmail,
      directDepositStatus: "not_requested",
      paperworkHistoryMessage:
        "Paperwork signed — direct deposit email skipped (no candidate email on file).",
      audit: {
        action: "direct_deposit_skipped",
        byUserId: input.byUserId,
        metadata: { reason: "missing_email" },
      },
    });
    return { workflow, emailSent: false, skipped: "missing_email" };
  }

  const send = await sendDirectDepositVerificationEmail({
    to: email,
    candidateId: input.workflow.candidateId,
    resend: false,
  });

  if (!send.ok) {
    const workflow = await upsertCandidateWorkflow({
      candidateId: input.workflow.candidateId,
      workflowStatus: input.workflow.workflowStatus,
      onboardingContactEmail: email,
      directDepositStatus: "not_requested",
      paperworkHistoryMessage: `Direct deposit email failed: ${send.error ?? "unknown error"}.`,
      audit: {
        action: "direct_deposit_send_failed",
        byUserId: input.byUserId,
        metadata: { error: send.error ?? "unknown" },
      },
    });
    return { workflow, emailSent: false, skipped: "send_failed" };
  }

  const now = new Date().toISOString();
  const workflow = await upsertCandidateWorkflow({
    candidateId: input.workflow.candidateId,
    workflowStatus: "Awaiting DD Verification",
    onboardingContactEmail: email,
    directDepositStatus: "requested",
    directDepositRequestedAt: now,
    directDepositLastReminderAt: now,
    paperworkHistoryMessage: "Direct deposit verification email sent to candidate.",
    audit: {
      action: "direct_deposit_requested",
      byUserId: input.byUserId,
      metadata: { recipientEmail: email },
    },
  });

  return { workflow, emailSent: true };
}

export async function resendDirectDepositVerificationEmail(input: {
  candidateId: string;
  recipientEmail?: string | null;
  byUserId?: string;
}): Promise<DirectDepositWorkflowResult> {
  const { getCandidateWorkflowState } = await import("@/lib/candidate-workflow-store");
  const workflows = await getCandidateWorkflowState();
  const existing = workflows[input.candidateId];
  if (!existing) {
    throw new Error("Candidate workflow not found.");
  }
  if (existing.paperworkStatus !== "signed") {
    throw new Error("Paperwork must be signed before requesting direct deposit verification.");
  }
  if (existing.directDepositStatus === "approved") {
    throw new Error("Direct deposit is already approved.");
  }

  const email = await resolveOnboardingContactEmail({
    workflow: existing,
    overrideEmail: input.recipientEmail,
  });
  if (!email) {
    throw new Error("No candidate email available for direct deposit follow-up.");
  }

  const send = await sendDirectDepositVerificationEmail({
    to: email,
    candidateId: input.candidateId,
    resend: true,
  });
  if (!send.ok) {
    throw new Error(send.error ?? "Failed to send direct deposit email.");
  }

  const now = new Date().toISOString();
  const workflow = await upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus:
      existing.workflowStatus === "Signed" ? "Awaiting DD Verification" : existing.workflowStatus,
    onboardingContactEmail: email,
    directDepositStatus: existing.directDepositStatus === "not_requested" ? "requested" : existing.directDepositStatus,
    directDepositRequestedAt: existing.directDepositRequestedAt ?? now,
    directDepositLastReminderAt: now,
    paperworkHistoryMessage: "Direct deposit verification email resent to candidate.",
    audit: {
      action: "direct_deposit_resent",
      byUserId: input.byUserId,
      metadata: { recipientEmail: email },
    },
  });

  return { workflow, emailSent: true };
}

export async function markDirectDepositReceived(input: {
  candidateId: string;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    directDepositStatus: "received",
    paperworkHistoryMessage: "Direct deposit documents marked received (recruiter/HR).",
    audit: { action: "direct_deposit_received", byUserId: input.byUserId, metadata: { at: now } },
  });
}

export async function markDirectDepositApproved(input: {
  candidateId: string;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    directDepositStatus: "approved",
    paperworkHistoryMessage: "Direct deposit verification approved by recruiter/HR.",
    audit: { action: "direct_deposit_approved", byUserId: input.byUserId, metadata: { at: now } },
  });
}

export async function updateDirectDepositNotes(input: {
  candidateId: string;
  notes: string;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const trimmed = input.notes.trim();
  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    directDepositNotes: trimmed || null,
    paperworkHistoryMessage: trimmed
      ? `Payroll note updated: ${trimmed.slice(0, 120)}${trimmed.length > 120 ? "…" : ""}`
      : "Payroll notes cleared.",
    audit: {
      action: "direct_deposit_notes",
      byUserId: input.byUserId,
      metadata: { length: trimmed.length },
    },
  });
}
