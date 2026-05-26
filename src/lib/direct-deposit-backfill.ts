import { peekBreezyCandidatesCache, type BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord, CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { resolveOnboardingContactEmail } from "@/lib/onboarding-contact-email";
import {
  hasDirectDepositEmailInOutbox,
  readTransactionalEmailOutbox,
  type TransactionalEmailOutboxRow,
} from "@/lib/transactional-email-outbox";
import { getDirectDepositHrCopyConfig } from "@/lib/direct-deposit-email-config";
import { directDepositStatusLabel } from "@/lib/direct-deposit-types";

export type DirectDepositBackfillContactEmailSource = "workflow" | "dropbox_sign" | "breezy";

/** Signed paperwork within this window may appear in the manual DD backfill queue. */
export const DIRECT_DEPOSIT_BACKFILL_WINDOW_MS = 72 * 60 * 60 * 1000;

export type DirectDepositBackfillRow = {
  candidateId: string;
  displayName: string;
  contactEmail: string | null;
  contactEmailSource: DirectDepositBackfillContactEmailSource | null;
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

    rows.push({
      candidateId: workflow.candidateId,
      displayName: workflow.candidateId,
      contactEmail: workflow.onboardingContactEmail?.trim() || null,
      contactEmailSource: workflow.onboardingContactEmail?.trim()
        ? "workflow"
        : null,
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
      eligible: !outbox.sent,
      ineligibleReason: outbox.sent ? "Already in email outbox" : undefined,
    });
  }

  const sorted = rows.sort(
    (a, b) => new Date(b.paperworkSignedAt).getTime() - new Date(a.paperworkSignedAt).getTime(),
  );
  return enrichDirectDepositBackfillRows(sorted, workflows);
}

function breezyCandidateDisplayName(candidate: BreezyCandidate): string {
  const full = `${candidate.firstName} ${candidate.lastName}`.trim();
  return full || candidate.email?.trim() || candidate.candidateId;
}

function peekBreezyCandidatesById(): Map<string, BreezyCandidate> {
  const map = new Map<string, BreezyCandidate>();
  for (const scanMode of ["preview", "fast", "full"] as const) {
    const hit = peekBreezyCandidatesCache({ scanMode });
    if (!hit?.ok) continue;
    for (const candidate of hit.candidates) {
      map.set(candidate.candidateId, candidate);
    }
  }
  return map;
}

/** Resolve display name and send-to email from workflow, Dropbox Sign, and Breezy cache. */
export async function enrichDirectDepositBackfillRows(
  rows: DirectDepositBackfillRow[],
  workflows: CandidateWorkflowState,
): Promise<DirectDepositBackfillRow[]> {
  const breezyById = peekBreezyCandidatesById();

  return Promise.all(
    rows.map(async (row) => {
      const workflow = workflows[row.candidateId];
      const breezy = breezyById.get(row.candidateId);
      const displayName = breezy ? breezyCandidateDisplayName(breezy) : row.displayName;

      let contactEmail = row.onboardingContactEmail?.trim() || null;
      let contactEmailSource = row.contactEmailSource;

      if (!contactEmail && workflow) {
        const fromDropbox = await resolveOnboardingContactEmail({ workflow });
        if (fromDropbox) {
          contactEmail = fromDropbox;
          contactEmailSource = "dropbox_sign";
        }
      }
      if (!contactEmail && breezy?.email?.trim()) {
        contactEmail = breezy.email.trim();
        contactEmailSource = "breezy";
      }

      if (row.outboxAlreadySent) {
        return {
          ...row,
          displayName,
          contactEmail,
          contactEmailSource,
          eligible: false,
          ineligibleReason: row.ineligibleReason ?? "Already in email outbox",
        };
      }

      if (!contactEmail) {
        return {
          ...row,
          displayName,
          contactEmail: null,
          contactEmailSource: null,
          eligible: false,
          ineligibleReason:
            "No contact email (set on workflow, Dropbox Sign signer, or Breezy profile)",
        };
      }

      return {
        ...row,
        displayName,
        contactEmail,
        contactEmailSource,
        eligible: true,
        ineligibleReason: undefined,
      };
    }),
  );
}

export function directDepositBackfillSummaryLabel(row: DirectDepositBackfillRow): string {
  return `${directDepositStatusLabel(row.directDepositStatus)}${
    row.outboxAlreadySent ? " · outbox logged" : ""
  }`;
}
