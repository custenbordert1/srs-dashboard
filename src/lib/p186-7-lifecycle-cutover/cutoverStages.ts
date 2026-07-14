import type { P1867CutoverStage, P1867GateResult } from "@/lib/p186-7-lifecycle-cutover/types";
import { P1867_IMPLEMENTED_MAX_STAGE } from "@/lib/p186-7-lifecycle-cutover/types";
import { readShadowMatchThreshold } from "@/lib/p186-7-lifecycle-cutover/flags";
import type { P1867ShadowParityReport } from "@/lib/p186-7-lifecycle-cutover/types";

const STAGE_ORDER: P1867CutoverStage[] = [
  "stage_0_shadow_only",
  "stage_1_read_only_enablement",
  "stage_2_single_transition_canary",
  "stage_3_limited_lifecycle_authority",
  "stage_4_full_lifecycle_authority",
  "stage_5_retirement",
];

export function stageIndex(stage: P1867CutoverStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Cutover stage engine — P186.7 allows planning through Stage 1 only.
 */
export function resolveAllowedStage(requested: P1867CutoverStage): {
  stage: P1867CutoverStage;
  allowed: boolean;
  detail: string;
} {
  if (stageIndex(requested) <= stageIndex(P1867_IMPLEMENTED_MAX_STAGE)) {
    return { stage: requested, allowed: true, detail: "Within P186.7 max stage" };
  }
  return {
    stage: P1867_IMPLEMENTED_MAX_STAGE,
    allowed: false,
    detail: `P186.7 stops before Stage 2; requested ${requested} blocked without explicit operator authorization`,
  };
}

export type ReadinessInput = {
  shadowParity: P1867ShadowParityReport;
  unresolvedLifecycleOperations: number;
  duplicateWriterWritesInWindow: number;
  neonHealthy: boolean;
  schemaHealthy: boolean;
  eventIngestionHealthy: boolean;
  reconcilerHealthy: boolean;
  workflowAdapterHealthy: boolean;
  auditPersistenceHealthy: boolean;
  rollbackTested: boolean;
  operatorDashboardReviewed: boolean;
  executiveDashboardReviewed: boolean;
  p184P185Isolated: boolean;
  paperworkModeDryRun: boolean;
  automaticMelExportDisabled: boolean;
};

export function evaluateCutoverReadinessGates(input: ReadinessInput): {
  ok: boolean;
  gates: P1867GateResult[];
  readyForStage2Canary: boolean;
} {
  const threshold = readShadowMatchThreshold();
  const gates: P1867GateResult[] = [
    {
      gateId: "shadow_match_rate",
      ok: input.shadowParity.matchRate >= threshold,
      detail: `matchRate=${input.shadowParity.matchRate} threshold=${threshold}`,
    },
    {
      gateId: "zero_critical_mismatches",
      ok: input.shadowParity.criticalMismatches === 0,
      detail: `criticalMismatches=${input.shadowParity.criticalMismatches}`,
    },
    {
      gateId: "zero_unresolved_operations",
      ok: input.unresolvedLifecycleOperations === 0,
      detail: `unresolved=${input.unresolvedLifecycleOperations}`,
    },
    {
      gateId: "no_duplicate_writer_writes",
      ok: input.duplicateWriterWritesInWindow === 0,
      detail: `duplicateWrites=${input.duplicateWriterWritesInWindow}`,
    },
    { gateId: "neon_healthy", ok: input.neonHealthy, detail: String(input.neonHealthy) },
    { gateId: "schema_healthy", ok: input.schemaHealthy, detail: String(input.schemaHealthy) },
    {
      gateId: "event_ingestion_healthy",
      ok: input.eventIngestionHealthy,
      detail: String(input.eventIngestionHealthy),
    },
    {
      gateId: "reconciler_healthy",
      ok: input.reconcilerHealthy,
      detail: String(input.reconcilerHealthy),
    },
    {
      gateId: "workflow_adapter_healthy",
      ok: input.workflowAdapterHealthy,
      detail: String(input.workflowAdapterHealthy),
    },
    {
      gateId: "audit_persistence_healthy",
      ok: input.auditPersistenceHealthy,
      detail: String(input.auditPersistenceHealthy),
    },
    { gateId: "rollback_tested", ok: input.rollbackTested, detail: String(input.rollbackTested) },
    {
      gateId: "operator_dashboard_reviewed",
      ok: input.operatorDashboardReviewed,
      detail: String(input.operatorDashboardReviewed),
    },
    {
      gateId: "executive_dashboard_reviewed",
      ok: input.executiveDashboardReviewed,
      detail: String(input.executiveDashboardReviewed),
    },
    {
      gateId: "p184_p185_isolation",
      ok: input.p184P185Isolated,
      detail: String(input.p184P185Isolated),
    },
    {
      gateId: "paperwork_dry_run",
      ok: input.paperworkModeDryRun,
      detail: String(input.paperworkModeDryRun),
    },
    {
      gateId: "automatic_mel_export_disabled",
      ok: input.automaticMelExportDisabled,
      detail: String(input.automaticMelExportDisabled),
    },
  ];

  const ok = gates.every((g) => g.ok);
  return {
    ok,
    gates,
    // Stage 2 still requires separate explicit authorization even if gates pass
    readyForStage2Canary: ok,
  };
}
