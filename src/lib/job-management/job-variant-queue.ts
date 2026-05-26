import type { JobDraft, JobVariantQueueStatus } from "@/lib/job-management/job-draft-types";

export type JobVariantQueueTab = "pending" | "approved" | "published" | "archived";

export function isJobVariantDraft(draft: JobDraft): boolean {
  return Boolean(draft.variant?.variantGroupId);
}

export function variantQueueStatus(draft: JobDraft): JobVariantQueueStatus | null {
  return draft.variant?.queueStatus ?? null;
}

export function filterVariantDrafts(
  drafts: JobDraft[],
  tab: JobVariantQueueTab,
): JobDraft[] {
  return drafts
    .filter(isJobVariantDraft)
    .filter((draft) => {
      const status = draft.variant!.queueStatus;
      if (tab === "pending") return status === "pending";
      if (tab === "approved") return status === "approved";
      if (tab === "published") return status === "published" || draft.status === "pushed";
      return status === "archived" || status === "rejected";
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function canTransitionQueueStatus(
  from: JobVariantQueueStatus,
  to: JobVariantQueueStatus,
): boolean {
  if (from === to) return true;
  if (to === "archived" || to === "rejected") return true;
  if (from === "pending" && to === "approved") return true;
  if (from === "approved" && to === "published") return true;
  if (from === "approved" && to === "pending") return true;
  return false;
}

export function variantStatusLabel(draft: JobDraft): string {
  if (!draft.variant) return "Variant";
  if (draft.status === "pushed" || draft.variant.queueStatus === "published") return "Published";
  if (draft.variant.queueStatus === "approved") return "Approved";
  if (draft.variant.queueStatus === "archived") return "Archived";
  if (draft.variant.queueStatus === "rejected") return "Rejected";
  return "Pending review";
}
