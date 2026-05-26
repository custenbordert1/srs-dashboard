import type { JobDraft } from "@/lib/job-management/job-draft-types";

export function variantPushBlockReason(draft: JobDraft): string | null {
  if (!draft.variant) return null;
  if (draft.variant.queueStatus === "pending") {
    return "Variant must be approved before pushing to Breezy.";
  }
  if (draft.variant.queueStatus === "archived" || draft.variant.queueStatus === "rejected") {
    return "Archived or rejected variants cannot be pushed.";
  }
  if (draft.variant.queueStatus !== "approved") {
    return "Only approved variants can be pushed to Breezy.";
  }
  return null;
}
