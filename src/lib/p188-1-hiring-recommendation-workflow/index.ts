/** P188.1 — Hiring Recommendation workflow + recruiter/job recovery. */

export {
  P188_1_SOURCE_PHASE,
  P188_1_SCHEMA_VERSION,
  P188_1_RECOMMENDED_STAGE,
  P188_1_BULK_MAX,
} from "@/lib/p188-1-hiring-recommendation-workflow/types";
export type {
  P1881AllowedRole,
  P1881RecommendationStatus,
  P1881QueueId,
  P1881CandidateContext,
  P1881ValidationGate,
  P1881ValidationResult,
  P1881RecommendHireInput,
  P1881RecommendHireResult,
  P1881AuditRecord,
  P1881RecruiterRecoveryResult,
  P1881JobRecoveryResult,
  P1881BypassFinding,
  P1881QueueItem,
  P1881BulkPreviewResult,
} from "@/lib/p188-1-hiring-recommendation-workflow/types";

export { readP1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";
export type { P1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";

export {
  validateRecommendHire,
  buildRecommendHirePreview,
} from "@/lib/p188-1-hiring-recommendation-workflow/validator";

export {
  appendRecommendHireAudit,
  resetP1881AuditMemoryForTests,
  listP1881AuditMemoryForTests,
} from "@/lib/p188-1-hiring-recommendation-workflow/audit";

export { executeRecommendHire } from "@/lib/p188-1-hiring-recommendation-workflow/recommendHire";
export type { RecommendHireDeps } from "@/lib/p188-1-hiring-recommendation-workflow/recommendHire";

export {
  buildCandidateContextFromWorkflow,
} from "@/lib/p188-1-hiring-recommendation-workflow/context";
export type { ContextEnrichment } from "@/lib/p188-1-hiring-recommendation-workflow/context";

export {
  recoverRecruiterAssignment,
  classifyUnresolvedRecruiters,
} from "@/lib/p188-1-hiring-recommendation-workflow/recruiterRecovery";
export type { RecruiterRecoverySignals } from "@/lib/p188-1-hiring-recommendation-workflow/recruiterRecovery";

export { recoverJobAssignment } from "@/lib/p188-1-hiring-recommendation-workflow/jobRecovery";
export type {
  JobCatalogEntry,
  JobRecoverySignals,
} from "@/lib/p188-1-hiring-recommendation-workflow/jobRecovery";

export {
  detectOnboardingBypassFindings,
  planOnboardingReconcileGuard,
} from "@/lib/p188-1-hiring-recommendation-workflow/bypassDetector";

export { reconcileOnboardingWithMidfunnelGuard } from "@/lib/p188-1-hiring-recommendation-workflow/guardedReconcile";

export { buildRecommendationQueues } from "@/lib/p188-1-hiring-recommendation-workflow/queues";

export {
  previewBulkRecommendHire,
  executeBulkRecommendHire,
} from "@/lib/p188-1-hiring-recommendation-workflow/bulk";

export { forecastP187EligibilityAfterRecommendations } from "@/lib/p188-1-hiring-recommendation-workflow/p187Forecast";

export { executeSiblingWorkflowAction } from "@/lib/p188-1-hiring-recommendation-workflow/siblingActions";
