/** P186.4 — Single lifecycle reconciler + duplicate-writer freeze (shadow-only). */

export const P186_4_SOURCE_PHASE = "P186.4" as const;
export const P186_4_SCHEMA_VERSION = 4 as const;

export type P1864Authority =
  | "production"
  | "legacy"
  | "shadow"
  | "observe";

export type P1864RetirementRecommendation =
  | "keep"
  | "observe"
  | "freeze_later"
  | "retire_later"
  | "shadow_only";

export type P1864FindingKind =
  | "duplicate_writer"
  | "conflicting_authority"
  | "scheduler_overlap"
  | "stale_legacy_writer"
  | "missing_idempotency"
  | "missing_audit"
  | "unsafe_direct_mutation"
  | "unclear_ownership"
  | "no_issue";

export type P1864Severity = "critical" | "high" | "medium" | "low" | "info";

export type P1864DeprecationStatus =
  | "active"
  | "legacy_active"
  | "deprecated_still_referenced"
  | "shadow_only"
  | "observe_only";

export type P1864WriterRecord = {
  writerId: string;
  module: string;
  filePaths: string[];
  statesWritable: string[];
  ownedTransitions: string[];
  allowedSourceStates: string[];
  allowedDestinationStates: string[];
  sourceOfAuthority: P1864Authority;
  productionAuthoritative: boolean;
  shadowOnly: boolean;
  trigger: string;
  entryPoint: string | null;
  idempotency: "yes" | "no" | "partial" | "unknown";
  auditSupport: "yes" | "no" | "partial";
  featureFlag: string | null;
  conflictGroup: string | null;
  priority: number;
  deprecationStatus: P1864DeprecationStatus;
  productionUsage: string;
  overlapNotes: string;
  retirementRecommendation: P1864RetirementRecommendation;
};

export type P1864SchedulerRecord = {
  schedulerId: string;
  type: "cron-route" | "in-process-interval" | "host-interval" | "host-daemon" | "webhook-retry" | "manual-script";
  cadence: string;
  trigger: string;
  entryPoint: string;
  candidateScope: string;
  lockOrLease: "none" | "partial" | "yes" | "unknown";
  storageBackend: string;
  timeoutBehavior: string;
  overlapRisk: P1864Severity;
  duplicateProcessingRisk: P1864Severity;
  featureFlag: string | null;
  relatedWriterIds: string[];
};

export type P1864ConflictFinding = {
  id: string;
  kind: P1864FindingKind;
  severity: P1864Severity;
  transition: string | null;
  affectedCandidates: string[];
  activeWriters: string[];
  recommendedOwner: string;
  recommendedRetirementAction: string;
  status: "open" | "acknowledged" | "reviewed";
  assignedInvestigationOwner: string | null;
  detail: string;
};

export type P1864ReconcileSourceSnapshot = {
  candidateId: string;
  breezyState: string | null;
  productionWorkflowState: string | null;
  operatorApprovalState: string | null;
  paperworkEngineState: string | null;
  dropboxSignState: string | null;
  onboardingState: string | null;
  readyForMelState: string | null;
  melExportState: string | null;
  shadowLifecycleState: string | null;
};

export type P1864ReconcileFinding = {
  candidateId: string;
  severity: P1864Severity;
  kind: P1864FindingKind;
  likelyAuthoritativeSource: string;
  conflictingWriters: string[];
  recommendedOperatorAction: string;
  detail: string;
  sources: P1864ReconcileSourceSnapshot;
};

export type P1864FreezePlanItem = {
  writerId: string;
  currentRole: string;
  replacementPath: string;
  shadowObservationPeriod: string;
  disableFlag: string;
  rollbackFlag: string;
  cutoverPrerequisite: string;
  monitoringRequirement: string;
  rollbackProcedure: string;
  freezeOrder: number;
  /** Never set true by P186.4 — plan only. */
  disabledNow: false;
};

export type P1864ConflictDashboard = {
  sourcePhase: typeof P186_4_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  flags: {
    writerInventoryReport: boolean;
    conflictDashboard: boolean;
    reconcilerExecution: boolean;
    schedulerCollisionAnalysis: boolean;
  };
  summary: {
    totalWriters: number;
    authoritativeWriters: number;
    shadowWriters: number;
    duplicateWriterGroups: number;
    schedulerOverlaps: number;
    missingOwnershipTransitions: number;
    deprecatedStillReferenced: number;
    directMutationPaths: number;
    criticalFindings: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
  };
  findings: P1864ConflictFinding[];
  reconcileFindings: P1864ReconcileFinding[];
  freezeOrder: string[];
  recommendedCadence: string;
};
