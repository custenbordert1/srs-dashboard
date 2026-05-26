import type { CandidateWorkflowRecord, CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import {
  hasDirectDepositEmailInOutbox,
  readTransactionalEmailOutbox,
  type TransactionalEmailOutboxRow,
} from "@/lib/transactional-email-outbox";
import { getDirectDepositHrCopyConfig } from "@/lib/direct-deposit-email-config";
import { directDepositStatusLabel } from "@/lib/direct-deposit-types";

/** Signed paperwork within this window may appear in the manual DD backfill queue. */
export const DIRECT_DEPOSIT_BACKFILL_WINDOW_MS = 72 * 60 * 60 * 1000;

export type DirectDepositBackfillRow = {
  candidateId: string;
  paperworkSignedAt: string;
  assignedRecruiter: string;
  assignedDM: string;
  directDepositStatus: CandidateWorkflowRecord["directDepositStatus"];
  signatureRequestId: string | null;
  onboardingContactEmail: string | null;
  outboxAlreadySent: boolean;
  outboxSentAt: string | null;
  outboxHrCopyIncluded: boolean | null;
  outboxHrCopyAddress: string | null;
  configuredHrCopyAddress: string | null;
  eligible: boolean;
  ineligibleReason?: string;
};

export function isWithinDirectDepositBackfillWindow(
  paperworkSignedAt: string | null,
  referenceMs: number = Date.now(),
): boolean {
  if (!paperworkSignedAt?.trim()) return false;
  const signedMs = new Date(paperworkSignedAt).getTime();
  if (Number.isNaN(signedMs)) return false;
  return signedMs >= referenceMs - DIRECT_DEPOSIT_BACKFILL_WINDOW_MS;
}

export function isEligibleDirectDepositBackfillWorkflow(
  workflow: CandidateWorkflowRecord,
  referenceMs: number = Date.now(),
): boolean {
  return (
    workflow.paperworkStatus === "signed" &&
    workflow.directDepositStatus === "not_requested" &&
    isWithinDirectDepositBackfillWindow(workflow.paperworkSignedAt, referenceMs)
  );
}

export async function buildDirectDepositBackfillQueue(
  workflows: CandidateWorkflowState,
  options?: { referenceMs?: number; outboxRows?: TransactionalEmailOutboxRow[] },
): Promise<DirectDepositBackfillRow[]> {
  const referenceMs = options?.referenceMs ?? Date.now();
  const outboxRows = options?.outboxRows ?? (await readTransactionalEmailOutbox());
  const configuredHrCopy = getDirectDepositHrCopyConfig();

  const rows: DirectDepositBackfillRow[] = [];
  for (const workflow of Object.values(workflows)) {
    if (workflow.paperworkStatus !== "signed" || workflow.directDepositStatus !== "not_requested") {
      continue;
    }
    if (!isWithinDirectDepositBackfillWindow(workflow.paperworkSignedAt, referenceMs)) {
      continue;
    }

    const outbox = hasDirectDepositEmailInOutbox({
      candidateId: workflow.candidateId,
      signatureRequestId: workflow.signatureRequestId,
      rows: outboxRows,
    });

    const eligible = !outbox.sent;
    rows.push({
      candidateId: workflow.candidateId,
      paperworkSignedAt: workflow.paperworkSignedAt ?? "",
      assignedRecruiter: workflow.assignedRecruiter,
      assignedDM: workflow.assignedDM,
      directDepositStatus: workflow.directDepositStatus,
      signatureRequestId: workflow.signatureRequestId,
      onboardingContactEmail: workflow.onboardingContactEmail,
      outboxAlreadySent: outbox.sent,
      outboxSentAt: outbox.sentAt,
      outboxHrCopyIncluded: outbox.sent ? outbox.hrCopyIncluded : null,
      outboxHrCopyAddress: outbox.sent ? outbox.hrCopyAddress : null,
      configuredHrCopyAddress: configuredHrCopy.address,
      eligible,
      ineligibleReason: outbox.sent
        ? "Already in email outbox"
        : undefined,
    });
  }

  return rows.sort(
    (a, b) => new Date(b.paperworkSignedAt).getTime() - new Date(a.paperworkSignedAt).getTime(),
  );
}

export function directDepositBackfillSummaryLabel(row: DirectDepositBackfillRow): string {
  return `${directDepositStatusLabel(row.directDepositStatus)}${
    row.outboxAlreadySent ? " · outbox logged" : ""
  }`;
}
