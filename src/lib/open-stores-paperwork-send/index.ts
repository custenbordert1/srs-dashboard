export {
  OPENS_SHEET,
  BREEZY_POSTS_SHEET,
  DEFAULT_XLSX_BASENAME,
  DEFAULT_XLSX_BASENAME_ALT,
} from "@/lib/open-stores-paperwork-send/types";
export type {
  OpenStoreRow,
  BreezyPostRow,
  OpenStoreMatch,
  OpenStoreMatchConfidence,
  OpenStoresPaperworkSendOptions,
  OpenStoreApplicantSummary,
  OpenStoreTopStoreSummary,
  OpenStoreApplicantTrackingStatus,
  OpenStoreApplicantTrackingRow,
  OpenStoresPaperworkSendReport,
} from "@/lib/open-stores-paperwork-send/types";

export {
  loadTrendsWorkbook,
  parseOpensSheet,
  parseBreezyPostsSheet,
  opensWithApplicants,
} from "@/lib/open-stores-paperwork-send/parse-workbook";

export {
  matchOpensToBreezyPosts,
  attachLivePositionIds,
  uniqueMatchedPositionIds,
  sortOpensByApplicantCount,
} from "@/lib/open-stores-paperwork-send/match-opens-to-breezy";

export {
  resolveDefaultXlsxPath,
  defaultXlsxHint,
  listSearchedXlsxHints,
} from "@/lib/open-stores-paperwork-send/resolve-xlsx";

export {
  formatOpenStoresPaperworkMarkdown,
  formatOpenStoresPaperworkStdout,
  buildApplicantsPerStore,
  buildTopStoresByApplicants,
  buildReportTotals,
} from "@/lib/open-stores-paperwork-send/format-report";

export {
  buildApplicantTrackingList,
  tallyApplicantTracking,
  mapOutcomeToStatus,
  resolveSkipReason,
} from "@/lib/open-stores-paperwork-send/build-applicant-tracking";

export {
  assertForceAutoAdvanceAllowed,
  FORCE_AUTO_ADVANCE_WARNING,
} from "@/lib/open-stores-paperwork-send/force-auto-advance";

export {
  assertLivePilotEnvForExecute,
  inspectLivePilotEnv,
  resolveOpenStoresConfirmationPhrase,
  ensurePilotMaxSendsForCanary,
  LIVE_PILOT_ENV_EXPORT_BLOCK,
  LIVE_PILOT_ENV_VARS,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";

export { runOpenStoresPaperworkSend } from "@/lib/open-stores-paperwork-send/run-open-stores-paperwork-send";

export {
  normalizeCity,
  normalizeState,
  normalizeText,
  normalizePositionKey,
  parseCityState,
  cityStateFromPositionName,
  isApplicantYes,
  sanitizeSpecialChars,
  fuzzyCityScore,
  effectiveApplicantCount,
} from "@/lib/open-stores-paperwork-send/normalize";
