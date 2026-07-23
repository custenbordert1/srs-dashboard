export {
  P203_2_SOURCE_PHASE,
  P203_2_SCHEMA_VERSION,
  P203_2_MAX_BATCH,
  P203_2_PRODUCTION_POLICY,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/types";
export type {
  P2032AuditCounts,
  P2032Authorization,
  P2032CleanupAttempt,
  P2032Classification,
  P2032OperatorLocalRow,
  P2032PreviewRow,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/types";

export {
  scanValidOwnershipEvidenceFromWorkflowAudit,
  pickLatestValidLedgerEvidence,
  pickLatestValidP158Evidence,
  isValidProductionRecruiterName,
  redactedCandidateId,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/evidence";

export {
  buildDemoOwnershipAudit,
  proposeDemoOwnershipCleanup,
  selectAutomaticRepairBatch,
  redactPreviewForPublic,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/select";

export {
  executeP2032DemoOwnershipCleanup,
  type P2032ExecutionResult,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/execute";

export {
  verifyP2032PostCleanup,
  type P2032PostCleanupVerification,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/verify";

export {
  normalizeDemoRecruiterAtIngestionBoundary,
  scrubDemoOwnershipSignals,
  shouldRejectDemoOverwrite,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/prevent";
