export type JobDraftStatus = "draft" | "pushed" | "push_failed";

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

export type BreezyJobCatalogSnapshot = {
  ok: true;
  jobs: BreezyJobCatalogRow[];
  fetchedAt: string;
  fromCache: boolean;
  companyId?: string;
  companyName?: string;
};
