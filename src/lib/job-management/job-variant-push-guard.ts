import type { JobDraft } from "@/lib/job-management/job-draft-types";
import {
  isJobDraftPendingPush,
  isJobDraftPublished,
  normalizeJobDraftStatus,
} from "@/lib/job-management/job-draft-status";

export function variantPushBlockReason(draft: JobDraft): string | null {
  if (isJobDraftPendingPush(draft)) {
    return "Push is already in progress. Wait for Breezy to finish or refresh.";
  }
  if (isJobDraftPublished(draft)) {
    return "This variant was already published to Breezy. Use Republish to post again.";
  }
  if (normalizeJobDraftStatus(draft.status) !== "draft" && normalizeJobDraftStatus(draft.status) !== "push_failed") {
    return "Only draft or retryable failed jobs can be pushed.";
  }
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
