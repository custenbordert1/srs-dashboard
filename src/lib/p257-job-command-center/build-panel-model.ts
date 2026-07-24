import type { JobManagementRow } from "@/lib/job-management/job-management-rows";
import { JOB_STATUS_LABELS } from "@/lib/job-management/job-management-rows";
import { buildJobCommandCenterActivity } from "@/lib/p257-job-command-center/activity";
import {
  buildJobCommandCenterApplicantRows,
  buildJobCommandCenterMetrics,
  buildJobCommandCenterPipeline,
} from "@/lib/p257-job-command-center/metrics";
import type {
  BuildJobCommandCenterPanelInput,
  JobCommandCenterOverview,
  JobCommandCenterPanelModel,
} from "@/lib/p257-job-command-center/types";

function publishedOrDraftLabel(
  status: JobManagementRow["status"],
): JobCommandCenterOverview["publishedOrDraft"] {
  switch (status) {
    case "published":
      return "Published";
    case "draft":
      return "Draft";
    case "push_failed":
      return "Push Failed";
    default:
      return "Needs Review";
  }
}

export function buildJobCommandCenterOverview(
  row: JobManagementRow,
  applicantCount: number,
): JobCommandCenterOverview {
  const description =
    row.draft?.description?.trim() ||
    row.breezyJob?.description?.trim() ||
    "";

  return {
    jobTitle: row.title,
    /** Open Breezy positions map 1:1 to project naming (position name). */
    project: row.title,
    city: row.city,
    state: row.state,
    publishedStatus: row.statusLabel || JOB_STATUS_LABELS[row.status],
    publishedOrDraft: publishedOrDraftLabel(row.status),
    datePosted: row.postedDate || null,
    lastSynced: row.lastSynced || null,
    breezyJobId: row.breezyJobId ?? null,
    applicantCount,
    description,
  };
}

/** Pure builder for the Job Command Center panel view model (read-only). */
export function buildJobCommandCenterPanelModel(
  input: BuildJobCommandCenterPanelInput,
): JobCommandCenterPanelModel {
  const { row, applicants } = input;
  const jobLocation = { city: row.city, state: row.state };
  const metrics = buildJobCommandCenterMetrics(applicants, jobLocation);
  const pipeline = buildJobCommandCenterPipeline(applicants);
  const applicantRows = buildJobCommandCenterApplicantRows(applicants, jobLocation);
  const activity = buildJobCommandCenterActivity({
    applicants,
    lastSynced: row.lastSynced,
    datePosted: row.postedDate,
    maxItems: input.options?.maxActivityItems ?? 40,
  });

  const dataNotes: string[] = [];
  if (!row.breezyJobId) {
    dataNotes.push("Local draft has no Breezy job ID yet — pipeline metrics stay empty until pushed.");
  }
  if (applicants.length === 0 && row.breezyJobId) {
    dataNotes.push(
      "No applicants matched this job in the current candidate snapshot. Open Candidates or Refresh / Sync to hydrate.",
    );
  }
  if (metrics.distanceSampleSize === 0 && applicants.length > 0) {
    dataNotes.push("Average distance unavailable — applicant or job location fields are sparse.");
  }
  if (activity.filter((item) => item.kind === "workflow" || item.kind === "paperwork").length === 0) {
    dataNotes.push(
      "Activity feed is sparse: durable workflow history is limited for applicants on this job.",
    );
  }
  if (input.options?.candidatesFromCache) {
    dataNotes.push("Applicant list composed from cached / ingested candidates (read-only).");
  }

  return {
    overview: buildJobCommandCenterOverview(row, metrics.applicants),
    metrics,
    pipeline,
    applicants: applicantRows,
    activity,
    dataNotes,
    source: {
      candidatesFromCache: Boolean(input.options?.candidatesFromCache),
      workflowsLoaded: Boolean(input.options?.workflowsLoaded),
      candidateCountConsidered: applicants.length,
    },
  };
}
