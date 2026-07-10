import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";

export const P175_SOURCE_PHASE = "P175";
export const BREEZY_EXPORT_APPLICANTS_SHEET = "Breezy Applicants";
export const DEFAULT_BREEZY_EXPORT_WORKBOOK = "diagnostics/Breezy Info.xlsx";

export type BreezyExportNormalizedRow = {
  rowNumber: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  positionName: string;
  positionId: string;
  city: string;
  state: string;
  source: string;
  recruiter: string;
  appliedAt: string;
  lastActivityAt: string;
  syntheticCandidateId: string;
};

export type BreezyExportImportAction = "add" | "merge" | "skip";

export type BreezyExportImportPlanRow = {
  rowNumber: number;
  action: BreezyExportImportAction;
  email: string;
  name: string;
  positionName: string;
  appliedAt: string;
  targetCandidateId: string;
  existingCandidateId: string | null;
  ingestionSource: BreezyCandidate["ingestionSource"];
  skipReason?: string;
  duplicateRisk?: boolean;
};

export type BreezyExportImportPreImportStats = {
  ingestionCount: number;
  apiOnlyCount: number;
  exportOnlyCount: number;
  matchedCount: number;
  duplicateRiskCount: number;
  exportRowCount: number;
  exportUniqueEmails: number;
};

export type BreezyExportImportPlan = {
  sourcePhase: typeof P175_SOURCE_PHASE;
  generatedAt: string;
  workbookPath: string;
  dryRun: boolean;
  preImport: BreezyExportImportPreImportStats;
  wouldAdd: number;
  wouldMerge: number;
  wouldSkip: number;
  rows: BreezyExportImportPlanRow[];
  newestAfterImport: Array<{
    name: string;
    email: string;
    appliedAt: string;
    positionName: string;
    action: BreezyExportImportAction;
    targetCandidateId: string;
    discoverableP170: boolean;
    eligibleP157: boolean;
  }>;
  spotlight: {
    patriciaIrby: {
      query: string;
      discoverableBefore: boolean;
      discoverableAfter: boolean;
      action: BreezyExportImportAction | "already_present";
      candidateId: string | null;
    };
    july9Applicants: Array<{
      name: string;
      email: string;
      discoverableBefore: boolean;
      discoverableAfter: boolean;
      action: BreezyExportImportAction | "already_present";
    }>;
  };
};

export type BreezyExportImportAuditEntry = {
  id: string;
  at: string;
  byUserId: string;
  workbookPath: string;
  dryRun: boolean;
  confirmImport: boolean;
  preImport: BreezyExportImportPreImportStats;
  added: number;
  merged: number;
  skipped: number;
  postIngestionCount: number;
  rollbackPath: string | null;
};

export type BreezyExportImportResult = BreezyExportImportPlan & {
  ok: boolean;
  error?: string;
  imported: boolean;
  added: number;
  merged: number;
  skipped: number;
  postIngestionCount: number;
  rollbackPath: string | null;
  auditEntryId: string | null;
  workflowsBackfilled: number;
  workflowsReconciled: number;
};

export type BreezyExportImportRollbackFile = {
  sourcePhase: typeof P175_SOURCE_PHASE;
  createdAt: string;
  auditEntryId: string;
  store: CandidateIngestionStoreFile;
};
