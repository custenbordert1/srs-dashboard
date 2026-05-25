import { getSignatureRequest } from "@/lib/dropbox-sign";
import {
  buildDirectDepositVerificationEmailBody,
  buildDirectDepositVerificationEmailHtml,
} from "@/lib/direct-deposit-email-copy";
import {
  DIRECT_DEPOSIT_EMAIL_SUBJECT,
  DIRECT_DEPOSIT_HR_EMAIL,
} from "@/lib/direct-deposit-types";
import {
  isEligibleDirectDepositBackfillWorkflow,
} from "@/lib/direct-deposit-backfill";
import { hasDirectDepositEmailInOutbox, readTransactionalEmailOutbox } from "@/lib/transactional-email-outbox";
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
  signatureRequestId?: string | null;
  resend: boolean;
  source: "webhook" | "manual" | "backfill" | "resend";
}): Promise<{ ok: boolean; error?: string; deliveryMode: "log" | "resend" }> {
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
    {
      candidateId: input.candidateId,
      signatureRequestId: input.signatureRequestId ?? null,
      kind: "direct_deposit_verification",
      source: input.source,
    },
  );
  return {
    ok: result.ok,
    error: result.error,
    deliveryMode: result.mode === "resend" ? "resend" : "log",
  };
}

async function applyDirectDepositEmailSent(input: {
  candidateId: string;
  email: string;
  signatureRequestId?: string | null;
  existing: CandidateWorkflowRecord | undefined;
  byUserId?: string;
  historyMessage: string;
  auditAction: string;
  resend: boolean;
  deliveryMode: "log" | "resend";
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  const existing = input.existing;
  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus:
      existing?.workflowStatus === "Signed" ? "Awaiting DD Verification" : existing?.workflowStatus ?? "Awaiting DD Verification",
    onboardingContactEmail: input.email,
    directDepositStatus: "requested",
    directDepositRequestedAt: existing?.directDepositRequestedAt ?? now,
    directDepositLastReminderAt: now,
    directDepositTriggeredByUserId: input.byUserId ?? null,
    directDepositLastDeliveryMode: input.deliveryMode,
    paperworkHistoryMessage: input.historyMessage,
    audit: {
      action: input.auditAction,
      byUserId: input.byUserId,
      metadata: {
        recipientEmail: input.email,
        deliveryMode: input.deliveryMode,
        resend: input.resend,
      },
    },
  });
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
    signatureRequestId: input.signatureRequestId ?? input.workflow.signatureRequestId,
    resend: false,
    source: "webhook",
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

  const { getCandidateWorkflowState } = await import("@/lib/candidate-workflow-store");
  const workflows = await getCandidateWorkflowState();
  const workflow = await applyDirectDepositEmailSent({
    candidateId: input.workflow.candidateId,
    email,
    signatureRequestId: input.signatureRequestId ?? input.workflow.signatureRequestId,
    existing: workflows[input.workflow.candidateId],
    byUserId: input.byUserId,
    historyMessage: "Direct deposit verification email sent to candidate (automated after signature).",
    auditAction: "direct_deposit_requested",
    resend: false,
    deliveryMode: send.deliveryMode,
  });

  return { workflow, emailSent: true };
}

/** Manual backfill send — only recent signed candidates; never auto-bulk. */
export async function requestDirectDepositManualBackfill(input: {
  candidateId: string;
  recipientEmail?: string | null;
  byUserId: string;
}): Promise<DirectDepositWorkflowResult> {
  const { getCandidateWorkflowState } = await import("@/lib/candidate-workflow-store");
  const workflows = await getCandidateWorkflowState();
  const workflow = workflows[input.candidateId];
  if (!workflow) {
    throw new Error("Candidate workflow not found.");
  }
  if (!isEligibleDirectDepositBackfillWorkflow(workflow)) {
    throw new Error(
      "Candidate is outside the 72-hour backfill window or direct deposit was already requested.",
    );
  }

  const outboxRows = await readTransactionalEmailOutbox();
  const outbox = hasDirectDepositEmailInOutbox({
    candidateId: input.candidateId,
    signatureRequestId: workflow.signatureRequestId,
    rows: outboxRows,
  });
  if (outbox.sent) {
    throw new Error("Direct deposit email already logged in outbox for this candidate.");
  }

  const email = await resolveOnboardingContactEmail({
    workflow,
    overrideEmail: input.recipientEmail,
  });
  if (!email) {
    throw new Error("No candidate email available for direct deposit follow-up.");
  }

  const send = await sendDirectDepositVerificationEmail({
    to: email,
    candidateId: input.candidateId,
    signatureRequestId: workflow.signatureRequestId,
    resend: false,
    source: "backfill",
  });
  if (!send.ok) {
    throw new Error(send.error ?? "Failed to send direct deposit email.");
  }

  const updated = await applyDirectDepositEmailSent({
    candidateId: input.candidateId,
    email,
    signatureRequestId: workflow.signatureRequestId,
    existing: workflow,
    byUserId: input.byUserId,
    historyMessage: "Direct deposit verification email sent (manual backfill).",
    auditAction: "direct_deposit_backfill",
    resend: false,
    deliveryMode: send.deliveryMode,
  });

  return { workflow: updated, emailSent: true };
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
    signatureRequestId: existing.signatureRequestId,
    resend: true,
    source: "resend",
  });
  if (!send.ok) {
    throw new Error(send.error ?? "Failed to send direct deposit email.");
  }

  const workflow = await applyDirectDepositEmailSent({
    candidateId: input.candidateId,
    email,
    signatureRequestId: existing.signatureRequestId,
    existing,
    byUserId: input.byUserId,
    historyMessage: "Direct deposit verification email resent to candidate.",
    auditAction: "direct_deposit_resent",
    resend: true,
    deliveryMode: send.deliveryMode,
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
