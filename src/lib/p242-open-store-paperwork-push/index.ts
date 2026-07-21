export {
  P242_PHASE,
  P242_MAX_BATCH,
  P242_MAX_MILES,
  P242_TAYLOR,
  P242_CONFIRMATION_PHRASE,
} from "@/lib/p242-open-store-paperwork-push/types";
export type {
  P242BlockReason,
  P242Eligibility,
  P242StoreMatch,
  P242CandidateMatch,
  P242PreviewSummary,
  P242PreviewReport,
  P242AssignmentAuditRow,
  P242SendRow,
  P242FinalReport,
  P242RunOptions,
} from "@/lib/p242-open-store-paperwork-push/types";

export {
  discoverP242OpenStoreApplicants,
  displayName,
  normalizePhone,
  milesBetween,
} from "@/lib/p242-open-store-paperwork-push/discover";

export {
  P242_KNOWN_CANARY_SENT_IDS,
  classifyP242Candidates,
  buildP242PreviewSummary,
} from "@/lib/p242-open-store-paperwork-push/classify";

export { assignP242Ownership } from "@/lib/p242-open-store-paperwork-push/assign";

export {
  formatP242PreviewMarkdown,
  formatP242FinalMarkdown,
  summarizeEligibleForJson,
  summarizeBlockedForJson,
} from "@/lib/p242-open-store-paperwork-push/format";

export { buildP242Preview } from "@/lib/p242-open-store-paperwork-push/preview";

export { runP242OpenStorePaperworkPush } from "@/lib/p242-open-store-paperwork-push/execute";
