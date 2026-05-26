import type { JobApplicantCountsSource } from "@/lib/job-management/job-applicant-counts";

export type JobDraftStatus = "draft" | "pushed" | "push_failed";

export type JobVariantQueueStatus = "pending" | "approved" | "published" | "archived" | "rejected";

export type JobVariantMeta = {
  variantGroupId: string;
  variantIndex: number;
  sourceJobId: string;
  generatedTitle: string;
  generatedDescriptionHash: string;
  cityTarget: string;
  dmOwner: string;
  queueStatus: JobVariantQueueStatus;
};

export type JobDraft = {
  id: string;
  status: JobDraftStatus;
  clonedFromBreezyJobId?: string;
  title: string;
  description: string;
  city: string;
  usState: string;
  payRate: string;
  department: string;
  source: string;
  metadata?: Record<string, string>;
  variant?: JobVariantMeta;
  breezyJobId?: string;
  pushedAt?: string;
  pushError?: string;
  createdAt: string;
  updatedAt: string;
};

export type JobPushAuditEntry = {
  id: string;
  draftId: string;
  ok: boolean;
  breezyJobId?: string;
  error?: string;
  pushedAt: string;
  pushedBy?: string;
  title: string;
  city: string;
  usState: string;
};

export type BreezyJobCatalogRow = {
  breezyJobId: string;
  title: string;
  city: string;
  usState: string;
  displayLocation: string;
  pipelineStatus: string;
  applicantCount: number | null;
  postedDate: string;
  source: string;
  description?: string;
  payRate?: string;
  department?: string;
};

export const JOB_MANAGEMENT_BREEZY_SOURCE = {
  label: "Breezy HR API",
  apiPath: "/api/job-management/breezy-jobs",
} as const;

export type BreezyJobCatalogSnapshot = {
  ok: true;
  jobs: BreezyJobCatalogRow[];
  fetchedAt: string;
  fromCache: boolean;
  /** True when the latest refresh failed but an older server catalog is being shown. */
  stale?: boolean;
  /** Set when draft leg failed but published jobs were returned. */
  partial?: boolean;
  refreshError?: string;
  warnings?: string[];
  source: typeof JOB_MANAGEMENT_BREEZY_SOURCE.label;
  sourcePath: typeof JOB_MANAGEMENT_BREEZY_SOURCE.apiPath;
  companyId?: string;
  companyName?: string;
  publishedCount?: number;
  draftCount?: number;
  /** How applicant counts were derived for catalog rows. */
  applicantCountsSource?: JobApplicantCountsSource;
  applicantCountsFromCache?: boolean;
  applicantCountsCachedAt?: string | null;
  applicantCountsCandidatesConsidered?: number;
};

export type BreezyJobCatalogFailure = {
  ok: false;
  error: string;
  fetchedAt: string;
  source: typeof JOB_MANAGEMENT_BREEZY_SOURCE.label;
  sourcePath: typeof JOB_MANAGEMENT_BREEZY_SOURCE.apiPath;
};

export type BreezyJobCatalogResult = BreezyJobCatalogSnapshot | BreezyJobCatalogFailure;
