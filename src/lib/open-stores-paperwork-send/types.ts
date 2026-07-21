import type { AutonomousCycleReport } from "@/lib/p243-autonomous-end-to-end-pipeline/types";

export const OPENS_SHEET = "Opens";
export const BREEZY_POSTS_SHEET = "Breezy Posts";

/** Preferred workbook filename (note double dots as exported). */
export const DEFAULT_XLSX_BASENAME = "Trends_Posts_With_Applicants..xlsx";
export const DEFAULT_XLSX_BASENAME_ALT = "Trends_Posts_With_Applicants.xlsx";

export type OpenStoreRow = {
  rowNumber: number;
  storeCall: string;
  projectNo: string;
  projectName: string;
  districtManager: string;
  locationName: string;
  locationNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  startDate: string;
  endDate: string;
  staffName: string;
  applicantYesNo: string;
  applicantCount: number;
  hasApplicants: boolean;
};

export type BreezyPostRow = {
  rowNumber: number;
  status: string;
  name: string;
  location: string;
  type: string;
  candidates: number;
  created: string;
  lastUpdated: string;
  hiringTeam: string;
  city: string;
  state: string;
};

export type OpenStoreMatchConfidence = "exact_location" | "name_location" | "city_only" | "unmatched" | "ambiguous";

export type OpenStoreMatch = {
  open: OpenStoreRow;
  breezyPost: BreezyPostRow | null;
  positionId: string | null;
  positionName: string | null;
  confidence: OpenStoreMatchConfidence;
  matchNotes: string[];
  alternatePosts: Array<{ name: string; location: string; candidates: number }>;
};

export type OpenStoresPaperworkSendOptions = {
  xlsxPath: string;
  dryRun?: boolean;
  confirmLive?: boolean;
  canaryLimit?: number;
  /** Cap how many open stores (matched positions) to process. */
  limit?: number;
  forceFreshReset?: boolean;
  useLLMEnhancement?: boolean;
  /** Skip calling Breezy live API — match sheet-only (no positionIds / cycle). */
  sheetOnly?: boolean;
  /**
   * Dangerous: treat P204 human_review as auto_advance for paperwork.
   * Requires dryRun=false + confirmLive=true. Still respects canary / idempotency / already-sent.
   */
  forceAutoAdvance?: boolean;
  /**
   * P122 confirmation phrase forwarded to P243 → runPaperworkCycle.
   * Required for live execute; CLI auto-injects when --live --confirm-live.
   */
  confirmationPhrase?: string;
};

export type OpenStoreApplicantSummary = {
  projectNo: string;
  projectName: string;
  city: string;
  state: string;
  districtManager: string;
  sheetApplicantCount: number;
  breezyPostName: string | null;
  positionId: string | null;
  matchConfidence: OpenStoreMatchConfidence;
  cyclePulled: number;
  cycleAutoAdvance: number;
  cyclePaperworkPlanned: number;
  cyclePaperworkSent: number;
  cycleFailures: number;
  matchNotes: string[];
};

export type OpenStoreTopStoreSummary = {
  city: string;
  state: string;
  applicantCount: number;
  breezyPostName: string | null;
  matchConfidence: OpenStoreMatchConfidence;
};

export type OpenStoreApplicantTrackingStatus = "planned" | "sent" | "skipped";

/** Per-applicant paperwork tracking derived from P243 cycle outcomes. */
export type OpenStoreApplicantTrackingRow = {
  candidateId: string;
  redactedCandidateId: string;
  name: string;
  email: string | null;
  positionId: string | null;
  positionName: string | null;
  storeCity: string | null;
  storeState: string | null;
  storeLabel: string | null;
  breezyPostName: string | null;
  paperworkType: string;
  status: OpenStoreApplicantTrackingStatus;
  skipReason: string | null;
  p204Outcome: string;
  p204Recommendation: string | null;
  confidence: number | null;
  paperworkTasksPlanned: number;
  /** True when P204 advanced (or would have) before send/canary. */
  qualifiedAdvanced: boolean;
  /** True when human_review was overridden via forceAutoAdvance. */
  forcedAutoAdvance: boolean;
  appliedAt: string | null;
};

export type OpenStoresPaperworkSendReport = {
  generatedAt: string;
  xlsxPath: string;
  mode: "dry_run" | "canary_live" | "blocked_fallback_dry_run";
  dryRun: boolean;
  confirmLive: boolean;
  canaryLimit: number;
  forceFreshReset: boolean;
  forceAutoAdvance: boolean;
  forcedAutoAdvanceCount: number;
  opensWithApplicants: number;
  /** Sum of sheet applicant counts (Breezy Candidates fallback) across processed opens. */
  totalSheetApplicants: number;
  /** Cycle auto_advance count when a P243 cycle ran; else estimated from sheet matches. */
  totalQualifiedApplicants: number;
  estimatedPaperworkSends: number;
  topStoresByApplicants: OpenStoreTopStoreSummary[];
  matchedOpens: number;
  unmatchedOpens: number;
  ambiguousOpens: number;
  uniquePositionIds: number;
  positionIds: string[];
  applicantsPerStore: OpenStoreApplicantSummary[];
  /**
   * Always present in JSON. Empty when sheet-only / no cycle.
   * Terminal prints this only when `--show-applicants` is set.
   */
  applicants: OpenStoreApplicantTrackingRow[];
  applicantTally: {
    planned: number;
    sent: number;
    skipped: number;
    qualifiedAdvanced: number;
    forcedAutoAdvance: number;
  };
  totalPaperworkPlanned: number;
  totalPaperworkSent: number;
  totalFailures: number;
  failures: Array<{ candidateId: string; error: string; storeHint?: string }>;
  cycle: AutonomousCycleReport | null;
  notes: string[];
  warnings: string[];
};
