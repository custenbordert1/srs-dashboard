import { buildJobCommandCenterActivity } from "@/lib/p257-job-command-center";
import {
  buildJobCommandCenterOverview,
} from "@/lib/p257-job-command-center";
import type { JobManagementRow } from "@/lib/job-management/job-management-rows";
import { buildHiringWorkspaceApplicantRows } from "@/lib/p258-hiring-workspace/applicants";
import {
  buildHiringPipelineBuckets,
  buildHiringSummaryRibbon,
} from "@/lib/p258-hiring-workspace/pipeline";
import type {
  HiringWorkspaceActivityItem,
  HiringWorkspaceApplicantInput,
  HiringWorkspaceModel,
} from "@/lib/p258-hiring-workspace/types";
import type { BreezyJob } from "@/lib/breezy-api";

export type BuildHiringWorkspaceModelInput = {
  row: JobManagementRow;
  applicants: HiringWorkspaceApplicantInput[];
  options?: {
    candidatesFromCache?: boolean;
    workflowsLoaded?: boolean;
    maxActivityItems?: number;
    jobsByPositionId?: Map<string, BreezyJob>;
  };
};

function enrichActivity(
  base: ReturnType<typeof buildJobCommandCenterActivity>,
  applicants: HiringWorkspaceApplicantInput[],
): HiringWorkspaceActivityItem[] {
  const items: HiringWorkspaceActivityItem[] = base.map((item) => ({ ...item }));

  for (const applicant of applicants) {
    const name =
      `${applicant.firstName ?? ""} ${applicant.lastName ?? ""}`.trim() ||
      applicant.email ||
      applicant.candidateId;

    if (applicant.paperworkViewedAt) {
      items.push({
        id: `paperwork-viewed:${applicant.candidateId}:${applicant.paperworkViewedAt}`,
        at: applicant.paperworkViewedAt,
        kind: "paperwork",
        title: "Paperwork viewed",
        detail: name,
        candidateId: applicant.candidateId,
      });
    }

    for (const note of applicant.notes ?? []) {
      // Notes lack timestamps — surface as operator breadcrumbs when present.
      if (!note.trim()) continue;
      items.push({
        id: `note:${applicant.candidateId}:${note.slice(0, 40)}`,
        at: applicant.lastActionAt || applicant.updatedDate || applicant.appliedDate || new Date(0).toISOString(),
        kind: "operator",
        title: "Operator note",
        detail: `${name}: ${note}`,
        candidateId: applicant.candidateId,
      });
    }
  }

  items.sort((a, b) => {
    const aTime = new Date(a.at).getTime() || 0;
    const bTime = new Date(b.at).getTime() || 0;
    return bTime - aTime;
  });

  return items;
}

/** Pure builder for the Interactive Hiring Workspace panel model. */
export function buildHiringWorkspaceModel(
  input: BuildHiringWorkspaceModelInput,
): HiringWorkspaceModel {
  const { row, applicants } = input;
  const jobLocation = { city: row.city, state: row.state };
  const ribbon = buildHiringSummaryRibbon({
    applicants,
    jobLocation,
    lastSync: row.lastSynced,
  });
  const pipeline = buildHiringPipelineBuckets(applicants);
  const applicantRows = buildHiringWorkspaceApplicantRows(applicants, jobLocation, {
    jobsByPositionId: input.options?.jobsByPositionId,
  });
  const activity = enrichActivity(
    buildJobCommandCenterActivity({
      applicants,
      lastSynced: row.lastSynced,
      datePosted: row.postedDate,
      maxItems: input.options?.maxActivityItems ?? 60,
    }),
    applicants,
  ).slice(0, input.options?.maxActivityItems ?? 60);

  const dataNotes: string[] = [];
  if (!row.breezyJobId) {
    dataNotes.push("Local draft has no Breezy job ID yet — applicant workspace stays empty until pushed.");
  }
  if (applicants.length === 0 && row.breezyJobId) {
    dataNotes.push(
      "No applicants matched this job in the current candidate snapshot. Open Candidates or Refresh / Sync to hydrate.",
    );
  }
  if (ribbon.averageDistanceMiles == null && applicants.length > 0) {
    dataNotes.push("Average distance unavailable — applicant or job location fields are sparse.");
  }
  if (activity.filter((item) => item.kind === "workflow" || item.kind === "paperwork").length === 0) {
    dataNotes.push(
      "Activity feed is sparse: durable workflow / paperwork / email events are limited for this job.",
    );
  }
  if (input.options?.candidatesFromCache) {
    dataNotes.push("Applicant list composed from cached / ingested candidates (read-only load).");
  }
  dataNotes.push(
    "Send Paperwork is preview + confirmation only in P258 — no automatic paperwork sends or stage moves.",
  );

  return {
    overview: buildJobCommandCenterOverview(row, ribbon.applicants),
    ribbon,
    pipeline,
    applicants: applicantRows,
    activity,
    dataNotes,
    source: {
      candidatesFromCache: Boolean(input.options?.candidatesFromCache),
      workflowsLoaded: Boolean(input.options?.workflowsLoaded),
      candidateCountConsidered: applicants.length,
    },
    writePolicy: {
      autoWrites: false,
      paperworkSendMode: "preview_confirm_only",
    },
  };
}
