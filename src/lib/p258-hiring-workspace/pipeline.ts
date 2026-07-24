import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { resolveApplicantDistanceMiles } from "@/lib/p257-job-command-center";
import type {
  HiringPipelineBucket,
  HiringPipelineFilterId,
  HiringSummaryRibbon,
  HiringWorkspaceApplicantInput,
  HiringWorkspaceApplicantRow,
} from "@/lib/p258-hiring-workspace/types";

export const HIRING_PIPELINE_ORDER: HiringPipelineFilterId[] = [
  "Applied",
  "Qualified",
  "Interview",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Ready for MEL",
  "Rejected",
  "Archived",
];

function stageHaystack(applicant: HiringWorkspaceApplicantInput): string {
  return `${applicant.stage ?? ""} ${applicant.workflowStatus}`.toLowerCase();
}

export function matchesHiringPipelineFilter(
  applicant: HiringWorkspaceApplicantInput | HiringWorkspaceApplicantRow,
  filter: HiringPipelineFilterId | null,
): boolean {
  if (!filter) return true;

  const stage = "breezyStage" in applicant ? applicant.breezyStage : (applicant.stage ?? "");
  const haystack = `${stage} ${applicant.workflowStatus}`.toLowerCase();
  const recommendInterview =
    "readyForPaperwork" in applicant
      ? false
      : Boolean((applicant as HiringWorkspaceApplicantInput).recommendInterview);

  switch (filter) {
    case "Applied":
      return applicant.workflowStatus === "Applied" || applicant.workflowStatus === "Needs Review";
    case "Qualified":
      return (
        applicant.workflowStatus === "Qualified" ||
        applicant.workflowStatus === "Operator Approved"
      );
    case "Interview":
      return haystack.includes("interview") || recommendInterview;
    case "Paperwork Needed":
      return applicant.workflowStatus === "Paperwork Needed";
    case "Paperwork Sent":
      return applicant.workflowStatus === "Paperwork Sent";
    case "Signed":
      return applicant.workflowStatus === "Signed";
    case "Ready for MEL":
      return applicant.workflowStatus === "Ready for MEL";
    case "Rejected":
      return (
        applicant.workflowStatus === "Not Qualified" ||
        haystack.includes("rejected") ||
        haystack.includes("disqualified")
      );
    case "Archived":
      return haystack.includes("archiv");
    default:
      return true;
  }
}

export function buildHiringPipelineBuckets(
  applicants: HiringWorkspaceApplicantInput[],
): HiringPipelineBucket[] {
  const counts = new Map<HiringPipelineFilterId, number>();
  for (const id of HIRING_PIPELINE_ORDER) counts.set(id, 0);

  for (const applicant of applicants) {
    for (const id of HIRING_PIPELINE_ORDER) {
      if (matchesHiringPipelineFilter(applicant, id)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }

  return HIRING_PIPELINE_ORDER.map((id) => ({
    id,
    label: id,
    count: counts.get(id) ?? 0,
  }));
}

function countStatus(
  applicants: HiringWorkspaceApplicantInput[],
  status: CandidateWorkflowStatus,
): number {
  return applicants.filter((row) => row.workflowStatus === status).length;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export function buildHiringSummaryRibbon(input: {
  applicants: HiringWorkspaceApplicantInput[];
  jobLocation: { city: string; state: string };
  lastSync?: string | null;
}): HiringSummaryRibbon {
  const { applicants, jobLocation } = input;
  const distances: number[] = [];
  let newest: string | null = null;
  let oldest: string | null = null;
  let newestMs = -Infinity;
  let oldestMs = Infinity;

  for (const applicant of applicants) {
    const miles = resolveApplicantDistanceMiles(applicant, jobLocation);
    if (miles != null && Number.isFinite(miles)) distances.push(miles);

    const applied = applicant.appliedDate?.trim();
    if (!applied) continue;
    const ms = new Date(applied).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > newestMs) {
      newestMs = ms;
      newest = applied;
    }
    if (ms < oldestMs) {
      oldestMs = ms;
      oldest = applied;
    }
  }

  return {
    applicants: applicants.length,
    qualified: countStatus(applicants, "Qualified") + countStatus(applicants, "Operator Approved"),
    paperworkNeeded: countStatus(applicants, "Paperwork Needed"),
    paperworkSent: countStatus(applicants, "Paperwork Sent"),
    signed: countStatus(applicants, "Signed"),
    readyForMel: countStatus(applicants, "Ready for MEL"),
    averageDistanceMiles: avg(distances),
    newestApplicantAt: newest,
    oldestApplicantAt: oldest,
    lastSync: input.lastSync ?? null,
  };
}

/** Dropbox Sign display status from workflow paperwork fields. */
export function formatDropboxSignStatus(input: {
  paperworkStatus?: string | null;
  signatureRequestId?: string | null;
}): string {
  const status = input.paperworkStatus ?? "not_sent";
  if (status === "signed") return "Signed";
  if (status === "viewed") return "Viewed";
  if (status === "sent") return input.signatureRequestId ? "Sent (active)" : "Sent";
  if (status === "declined") return "Declined";
  if (status === "failed") return "Failed";
  if (input.signatureRequestId) return "Request on file";
  return "Not sent";
}

export function filterApplicantsByPipeline<T extends HiringWorkspaceApplicantInput | HiringWorkspaceApplicantRow>(
  applicants: T[],
  filter: HiringPipelineFilterId | null,
): T[] {
  if (!filter) return applicants;
  return applicants.filter((row) => matchesHiringPipelineFilter(row, filter));
}

/** Exported for tests — stage haystack helper. */
export function hiringStageHaystack(applicant: HiringWorkspaceApplicantInput): string {
  return stageHaystack(applicant);
}
