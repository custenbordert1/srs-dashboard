import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";
import { reconcileJobDraftsWithCatalog } from "@/lib/job-management/job-draft-reconcile";
import { listJobDrafts, updateJobDraft } from "@/lib/job-management/job-draft-store";

export type PersistedDraftReconcileResult = {
  drafts: Awaited<ReturnType<typeof listJobDrafts>>;
  recoveredCount: number;
  reasons: string[];
};

export async function reconcileAndPersistJobDrafts(
  catalogJobs: BreezyJobCatalogRow[],
  syncedAt: string,
): Promise<PersistedDraftReconcileResult> {
  const drafts = await listJobDrafts();
  const batch = reconcileJobDraftsWithCatalog(drafts, catalogJobs, syncedAt);
  let recoveredCount = 0;
  const reasons: string[] = [];

  for (const outcome of batch.outcomes) {
    if (!outcome.changed) continue;
    const { id, status, breezyJobId, pushError, lastSyncAt, variant } = outcome.draft;
    await updateJobDraft(id, {
      status,
      breezyJobId,
      pushError,
      lastSyncAt,
      ...(variant ? { variant } : {}),
    });
    if (outcome.reason === "recovered_published") {
      recoveredCount += 1;
      reasons.push("recovered_published");
    }
  }

  const refreshed = recoveredCount > 0 ? await listJobDrafts() : batch.drafts;
  return { drafts: refreshed, recoveredCount, reasons };
}
