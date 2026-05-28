import type { BreezyJobCatalogRow, JobDraft } from "@/lib/job-management/job-draft-types";
import type { BreezyPositionVerification } from "@/lib/job-management/breezy-position-payload";
import { normalizeJobDraft, normalizeJobDraftStatus } from "@/lib/job-management/job-draft-status";

export type DraftReconcileOutcome = {
  draft: JobDraft;
  changed: boolean;
  reason?: "recovered_published" | "normalized_legacy_status" | "synced_variant_queue";
};

export type DraftReconcileBatchResult = {
  drafts: JobDraft[];
  outcomes: DraftReconcileOutcome[];
};

function catalogJobIsPublished(job: BreezyJobCatalogRow): boolean {
  const status = job.pipelineStatus.trim().toLowerCase();
  return status === "published" || status === "unknown";
}

function catalogHasPublishedJob(catalogJobs: BreezyJobCatalogRow[], breezyJobId: string): boolean {
  return catalogJobs.some((job) => job.breezyJobId === breezyJobId && catalogJobIsPublished(job));
}

export function reconcileJobDraftWithCatalog(
  draft: JobDraft,
  catalogJobs: BreezyJobCatalogRow[],
  syncedAt: string,
): DraftReconcileOutcome {
  let next = normalizeJobDraft(draft);
  let changed = next.status !== draft.status;
  let reason: DraftReconcileOutcome["reason"] | undefined = changed ? "normalized_legacy_status" : undefined;

  const breezyJobId = next.breezyJobId?.trim();
  if (!breezyJobId) {
    return { draft: next, changed, reason };
  }

  const inCatalog = catalogHasPublishedJob(catalogJobs, breezyJobId);
  if (!inCatalog) {
    return { draft: next, changed, reason };
  }

  const status = normalizeJobDraftStatus(next.status);
  if (status === "pending_push" || status === "draft" || status === "push_failed") {
    next = {
      ...next,
      status: "published",
      pushError: undefined,
      lastSyncAt: syncedAt,
    };
    changed = true;
    reason = "recovered_published";
  }

  if (next.variant && next.variant.queueStatus !== "published" && next.status === "published") {
    next = {
      ...next,
      variant: { ...next.variant, queueStatus: "published" },
      lastSyncAt: syncedAt,
    };
    changed = true;
    reason = reason ?? "synced_variant_queue";
  }

  return { draft: next, changed, reason };
}

export function reconcileJobDraftsWithCatalog(
  drafts: JobDraft[],
  catalogJobs: BreezyJobCatalogRow[],
  syncedAt: string,
): DraftReconcileBatchResult {
  const outcomes = drafts.map((draft) => reconcileJobDraftWithCatalog(draft, catalogJobs, syncedAt));
  return {
    drafts: outcomes.map((outcome) => outcome.draft),
    outcomes,
  };
}

export function verificationToAuditSnapshot(
  verification: BreezyPositionVerification,
  checkedAt: string,
): JobDraft["lastVerificationResult"] {
  return {
    ok: verification.ok,
    mismatches: verification.mismatches,
    checkedAt,
  };
}
