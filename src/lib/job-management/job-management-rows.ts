import type { BreezyJobCatalogRow, JobDraft } from "@/lib/job-management/job-draft-types";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";

export type JobManagementStatus = "draft" | "published" | "push_failed" | "needs_review";

export type JobManagementRowKind = "breezy" | "local_draft";

export type JobManagementSortKey =
  | "title"
  | "city"
  | "state"
  | "status"
  | "applicants"
  | "postedDate"
  | "source"
  | "lastSynced";

export type JobManagementRow = {
  rowId: string;
  kind: JobManagementRowKind;
  title: string;
  city: string;
  state: string;
  displayLocation: string;
  status: JobManagementStatus;
  statusLabel: string;
  applicants: number | null;
  postedDate: string;
  source: string;
  lastSynced: string;
  breezyJobId?: string;
  draftId?: string;
  draft?: JobDraft;
  breezyJob?: BreezyJobCatalogRow;
  editable: boolean;
  canPush: boolean;
  canClone: boolean;
  canDelete: boolean;
};

export const JOB_STATUS_LABELS: Record<JobManagementStatus, string> = {
  draft: "Draft",
  published: "Published",
  push_failed: "Push Failed",
  needs_review: "Needs Review",
};

function breezyRowStatus(pipelineStatus: string): JobManagementStatus {
  const normalized = pipelineStatus.trim().toLowerCase();
  if (normalized === "published" || normalized === "unknown") return "published";
  if (normalized === "draft") return "draft";
  return "needs_review";
}

function localDraftStatus(draft: JobDraft): JobManagementStatus {
  if (draft.status === "push_failed") return "push_failed";
  if (draft.status === "pushed") return "published";
  return "draft";
}

function rowFromBreezyJob(job: BreezyJobCatalogRow, lastSynced: string): JobManagementRow {
  const location = normalizeJobLocationFields(job.city, job.usState);
  const status = breezyRowStatus(job.pipelineStatus);
  return {
    rowId: `breezy:${job.breezyJobId}`,
    kind: "breezy",
    title: job.title,
    city: location.city,
    state: location.usState,
    displayLocation: job.displayLocation || location.displayLocation,
    status,
    statusLabel: JOB_STATUS_LABELS[status],
    applicants: job.applicantCount,
    postedDate: job.postedDate,
    source: job.source,
    lastSynced,
    breezyJobId: job.breezyJobId,
    breezyJob: job,
    editable: false,
    canPush: false,
    canClone: true,
    canDelete: false,
  };
}

/** Unpublished local drafts only — pushed drafts are represented by Breezy catalog rows. */
function isActiveLocalDraft(draft: JobDraft): boolean {
  return draft.status === "draft" || draft.status === "push_failed";
}

function dedupeBreezyCatalogRows(jobs: BreezyJobCatalogRow[]): BreezyJobCatalogRow[] {
  const byId = new Map<string, BreezyJobCatalogRow>();
  for (const job of jobs) {
    const existing = byId.get(job.breezyJobId);
    if (!existing) {
      byId.set(job.breezyJobId, job);
      continue;
    }
    const existingPublished =
      breezyRowStatus(existing.pipelineStatus) === "published" ||
      existing.pipelineStatus === "unknown";
    const incomingPublished =
      breezyRowStatus(job.pipelineStatus) === "published" || job.pipelineStatus === "unknown";
    if (incomingPublished && !existingPublished) {
      byId.set(job.breezyJobId, job);
    }
  }
  return [...byId.values()];
}

function rowPriorityForDedupe(row: JobManagementRow): number {
  if (row.kind === "local_draft" && row.draft?.status === "draft") return 3;
  if (row.kind === "local_draft" && row.draft?.status === "push_failed") return 2;
  return 1;
}

function dedupeRowsByBreezyJobId(rows: JobManagementRow[]): JobManagementRow[] {
  const withoutBreezyId: JobManagementRow[] = [];
  const byBreezyId = new Map<string, JobManagementRow>();

  for (const row of rows) {
    if (!row.breezyJobId) {
      withoutBreezyId.push(row);
      continue;
    }
    const existing = byBreezyId.get(row.breezyJobId);
    if (!existing || rowPriorityForDedupe(row) > rowPriorityForDedupe(existing)) {
      byBreezyId.set(row.breezyJobId, row);
    }
  }

  return [...withoutBreezyId, ...byBreezyId.values()];
}

function rowFromLocalDraft(draft: JobDraft): JobManagementRow {
  const location = normalizeJobLocationFields(draft.city, draft.usState);
  const status = localDraftStatus(draft);
  return {
    rowId: `draft:${draft.id}`,
    kind: "local_draft",
    title: draft.title,
    city: location.city,
    state: location.usState,
    displayLocation: location.displayLocation,
    status,
    statusLabel: JOB_STATUS_LABELS[status],
    applicants: null,
    postedDate: draft.pushedAt ?? draft.createdAt,
    source: draft.source || "SRS Dashboard",
    lastSynced: draft.updatedAt,
    breezyJobId: draft.breezyJobId,
    draftId: draft.id,
    draft,
    editable: draft.status === "draft",
    canPush: draft.status === "draft",
    canClone: false,
    canDelete: draft.status === "draft",
  };
}

export function buildJobManagementRows(
  breezyJobs: BreezyJobCatalogRow[],
  drafts: JobDraft[],
  catalogFetchedAt: string,
): JobManagementRow[] {
  const catalogJobs = dedupeBreezyCatalogRows(breezyJobs);

  const openCloneSourceIds = new Set(
    drafts
      .filter((draft) => draft.status === "draft" && draft.clonedFromBreezyJobId)
      .map((draft) => draft.clonedFromBreezyJobId!),
  );

  const rows: JobManagementRow[] = [];
  for (const draft of drafts) {
    if (!isActiveLocalDraft(draft)) continue;
    rows.push(rowFromLocalDraft(draft));
  }
  for (const job of catalogJobs) {
    if (openCloneSourceIds.has(job.breezyJobId)) continue;
    rows.push(rowFromBreezyJob(job, catalogFetchedAt));
  }
  return dedupeRowsByBreezyJobId(rows);
}

function sortValue(row: JobManagementRow, key: JobManagementSortKey): string | number {
  switch (key) {
    case "title":
      return row.title.toLowerCase();
    case "city":
      return row.city.toLowerCase();
    case "state":
      return row.state.toLowerCase();
    case "status":
      return row.statusLabel.toLowerCase();
    case "applicants":
      return row.applicants ?? -1;
    case "postedDate":
      return new Date(row.postedDate).getTime() || 0;
    case "source":
      return row.source.toLowerCase();
    case "lastSynced":
      return new Date(row.lastSynced).getTime() || 0;
    default:
      return "";
  }
}

export function sortJobManagementRows(
  rows: JobManagementRow[],
  sortKey: JobManagementSortKey,
  direction: "asc" | "desc",
): JobManagementRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const left = sortValue(a, sortKey);
    const right = sortValue(b, sortKey);
    if (left < right) return direction === "asc" ? -1 : 1;
    if (left > right) return direction === "asc" ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
  return copy;
}
