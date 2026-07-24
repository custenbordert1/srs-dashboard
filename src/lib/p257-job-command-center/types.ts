import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type { JobManagementRow } from "@/lib/job-management/job-management-rows";

export type JobCommandCenterTab = "overview" | "applicants" | "pipeline" | "activity";

export const JOB_COMMAND_CENTER_TABS: Array<{ id: JobCommandCenterTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "applicants", label: "Applicants" },
  { id: "pipeline", label: "Pipeline" },
  { id: "activity", label: "Activity" },
];

/** Metric statuses surfaced on the Job Command Center cards / pipeline tab. */
export const JOB_COMMAND_CENTER_METRIC_STATUSES = [
  "Qualified",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Ready for MEL",
] as const satisfies readonly CandidateWorkflowStatus[];

export type JobCommandCenterMetricStatus = (typeof JOB_COMMAND_CENTER_METRIC_STATUSES)[number];

export type JobCommandCenterApplicantInput = {
  candidateId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  positionId: string;
  positionName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  stage?: string;
  appliedDate?: string;
  updatedDate?: string;
  workflowStatus: CandidateWorkflowStatus;
  distanceMiles?: number | null;
  history?: Array<{
    id: string;
    type: string;
    message: string;
    createdAt: string;
  }>;
  lastActionAt?: string | null;
  paperworkSentAt?: string | null;
  paperworkSignedAt?: string | null;
};

export type JobCommandCenterMetrics = {
  applicants: number;
  qualified: number;
  paperworkNeeded: number;
  paperworkSent: number;
  signed: number;
  readyForMel: number;
  /** Mean of non-null distances; null when no distances available. */
  averageDistanceMiles: number | null;
  /** How many applicants contributed a distance value. */
  distanceSampleSize: number;
};

export type JobCommandCenterPipelineBucket = {
  status: CandidateWorkflowStatus;
  count: number;
};

export type JobCommandCenterApplicantRow = {
  candidateId: string;
  displayName: string;
  email: string;
  workflowStatus: CandidateWorkflowStatus;
  stage: string;
  appliedDate: string;
  city: string;
  state: string;
  distanceMiles: number | null;
};

export type JobCommandCenterActivityItem = {
  id: string;
  at: string;
  kind: "workflow" | "sync" | "paperwork" | "system";
  title: string;
  detail: string;
  candidateId?: string;
};

export type JobCommandCenterOverview = {
  jobTitle: string;
  project: string;
  city: string;
  state: string;
  publishedStatus: string;
  publishedOrDraft: "Published" | "Draft" | "Push Failed" | "Needs Review";
  datePosted: string | null;
  lastSynced: string | null;
  breezyJobId: string | null;
  applicantCount: number;
  description: string;
};

export type JobCommandCenterPanelModel = {
  overview: JobCommandCenterOverview;
  metrics: JobCommandCenterMetrics;
  pipeline: JobCommandCenterPipelineBucket[];
  applicants: JobCommandCenterApplicantRow[];
  activity: JobCommandCenterActivityItem[];
  dataNotes: string[];
  source: {
    candidatesFromCache: boolean;
    workflowsLoaded: boolean;
    candidateCountConsidered: number;
  };
};

export type BuildJobCommandCenterPanelInput = {
  row: JobManagementRow;
  applicants: JobCommandCenterApplicantInput[];
  options?: {
    candidatesFromCache?: boolean;
    workflowsLoaded?: boolean;
    maxActivityItems?: number;
  };
};
