import type { JobDraft, JobDraftStatus } from "@/lib/job-management/job-draft-types";

/** Legacy persisted value before `published` rename. */
const LEGACY_PUBLISHED_STATUS = "pushed";

export function normalizeJobDraftStatus(status: string): JobDraftStatus {
  if (status === LEGACY_PUBLISHED_STATUS) return "published";
  if (
    status === "draft" ||
    status === "pending_push" ||
    status === "published" ||
    status === "push_failed"
  ) {
    return status;
  }
  return "draft";
}

export function normalizeJobDraft(draft: JobDraft): JobDraft {
  return { ...draft, status: normalizeJobDraftStatus(draft.status) };
}

export function isJobDraftPushable(draft: JobDraft): boolean {
  const status = normalizeJobDraftStatus(draft.status);
  return status === "draft" || status === "push_failed";
}

export function isJobDraftPendingPush(draft: JobDraft): boolean {
  return normalizeJobDraftStatus(draft.status) === "pending_push";
}

export function isJobDraftPublished(draft: JobDraft): boolean {
  const status = normalizeJobDraftStatus(draft.status);
  return status === "published" && Boolean(draft.breezyJobId?.trim());
}

export function jobDraftRequiresRepublish(draft: JobDraft): boolean {
  return isJobDraftPublished(draft);
}
