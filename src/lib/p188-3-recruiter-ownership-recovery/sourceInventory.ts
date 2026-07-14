import type {
  P1883RootCauseFinding,
  P1883SourceTrace,
} from "@/lib/p188-3-recruiter-ownership-recovery/types";

/**
 * Static ownership-source inventory (code-verified).
 * Live population counts are filled by the analyzer from `.data` probes.
 */
export function buildStaticSourceInventory(live: {
  workflowsUnassigned: number;
  workflowsTotal: number;
  ingestionOwnerFieldsPresent: number;
  ingestionTotal: number;
  p158ProductionAssigned: number;
  p158Simulated: number;
  p158LastAt: string | null;
  auditLastAutoAssignAt: string | null;
  auditUniqueNamedCandidates: number;
  workflowStoreUpdatedAt: string | null;
}): P1883SourceTrace[] {
  const allUnassigned =
    live.workflowsTotal > 0 && live.workflowsUnassigned === live.workflowsTotal;

  return [
    {
      sourceId: "breezy_candidate_owner",
      exists: true,
      currentlyPopulated: false,
      productionUsage:
        "Breezy HRIS may expose owner nested objects; SRS sanitizeCandidate drops them before persistence.",
      lastWriter: "breezy-api.sanitizeCandidate",
      lastUpdate: null,
      whyOwnershipMissing:
        "BreezyCandidate type has no owner field; sanitize maps identity/stage/location/resume only.",
      writesAssignedRecruiter: false,
    },
    {
      sourceId: "breezy_assignee",
      exists: true,
      currentlyPopulated: false,
      productionUsage:
        "candidate-intelligence / P188.2 extractBreezyAssignee probe nested assignee paths on sanitized objects — always empty in production ingestion.",
      lastWriter: null,
      lastUpdate: null,
      whyOwnershipMissing: `Ingestion store: ${live.ingestionOwnerFieldsPresent}/${live.ingestionTotal} candidates with owner/assignee/recruiter keys.`,
      writesAssignedRecruiter: false,
    },
    {
      sourceId: "breezy_recruiter",
      exists: true,
      currentlyPopulated: false,
      productionUsage: "No top-level recruiter field retained on BreezyCandidate after sanitize.",
      lastWriter: null,
      lastUpdate: null,
      whyOwnershipMissing: "Schema mismatch / missing integration from Breezy assignee API.",
      writesAssignedRecruiter: false,
    },
    {
      sourceId: "candidate_ingestion",
      exists: true,
      currentlyPopulated: false,
      productionUsage:
        "Writes candidate-ingestion.json only (identity, position, stage). Does not store recruiter.",
      lastWriter: "mergeIngestedCandidates / run-ingestion-sync",
      lastUpdate: live.workflowStoreUpdatedAt,
      whyOwnershipMissing: "Never imports recruiter ownership into ingestion or workflow create path.",
      writesAssignedRecruiter: false,
    },
    {
      sourceId: "p158_assignment_engine",
      exists: true,
      currentlyPopulated: live.p158ProductionAssigned > 0,
      productionUsage:
        "Can write workflow assignedRecruiter when P158_AUTOMATIC_ASSIGNMENTS_ENABLED=true AND confirmAssignment=true. Local audit is simulation-only.",
      lastWriter: "p158 run-assignment-cycle / apply-recruiter-assignments",
      lastUpdate: live.p158LastAt,
      whyOwnershipMissing: `Production assigns=${live.p158ProductionAssigned}; simulated=${live.p158Simulated}. Feature remains simulation/disabled for durable writes.`,
      writesAssignedRecruiter: true,
    },
    {
      sourceId: "p169_orchestrator",
      exists: true,
      currentlyPopulated: false,
      productionUsage: "Read-only ownership consumer; asserts workflowStoreUnchanged on dry runs.",
      lastWriter: null,
      lastUpdate: null,
      whyOwnershipMissing: "Does not write recruiter ownership.",
      writesAssignedRecruiter: false,
    },
    {
      sourceId: "p171_lifecycle_manager",
      exists: true,
      currentlyPopulated: false,
      productionUsage: "Consumes assignment state for lifecycle; does not invent owners.",
      lastWriter: null,
      lastUpdate: null,
      whyOwnershipMissing: "Does not write recruiter ownership.",
      writesAssignedRecruiter: false,
    },
    {
      sourceId: "p83_advancement",
      exists: true,
      currentlyPopulated: false,
      productionUsage:
        "Blocks advancement/send when Unassigned; updates status/actions only (preserves recruiter when omitted).",
      lastWriter: "apply-candidate-advancements (status only)",
      lastUpdate: null,
      whyOwnershipMissing: "Never assigns recruiters; stalls downstream.",
      writesAssignedRecruiter: false,
    },
    {
      sourceId: "candidate_workflow_store",
      exists: true,
      currentlyPopulated: !allUnassigned,
      productionUsage:
        "Sole durable owner field: CandidateWorkflowRecord.assignedRecruiter. Defaults to Unassigned.",
      lastWriter: "upsertCandidateWorkflow",
      lastUpdate: live.workflowStoreUpdatedAt,
      whyOwnershipMissing: allUnassigned
        ? `All ${live.workflowsTotal} records currently Unassigned with recruiterAssignmentSource=null.`
        : "Partially populated.",
      writesAssignedRecruiter: true,
    },
    {
      sourceId: "historical_assignment_audit",
      exists: true,
      currentlyPopulated: live.auditUniqueNamedCandidates > 0,
      productionUsage:
        "candidate-workflow-audit.jsonl records auto_assign_recruiter / assign_recruiter events (append-only).",
      lastWriter: "candidate-workflow-store audit append",
      lastUpdate: live.auditLastAutoAssignAt,
      whyOwnershipMissing: `Audit retains named assignments for ${live.auditUniqueNamedCandidates} current-cohort candidates, but workflow rows no longer reflect them.`,
      writesAssignedRecruiter: false,
    },
    {
      sourceId: "executive_assignment_tools",
      exists: true,
      currentlyPopulated: false,
      productionUsage:
        "P158 dashboard + /api/recruiting/recruiter-assignments/run (sim by default); UI manual assign via /api/candidates/workflows.",
      lastWriter: "executive POST run / candidates-section manual save",
      lastUpdate: null,
      whyOwnershipMissing:
        "Manual assigns rare (audit shows ~10 assign_recruiter globally). Executive auto path stays dry-run without flags.",
      writesAssignedRecruiter: true,
    },
    {
      sourceId: "territory_assignment_logic",
      exists: true,
      currentlyPopulated: false,
      productionUsage:
        "P62/P151 build-assignment-decision → apply-recruiter-assignments. Writes auto source when automation runs.",
      lastWriter: "apply-recruiter-assignments / auto-assign API / P62 engine",
      lastUpdate: live.auditLastAutoAssignAt,
      whyOwnershipMissing:
        "Assignments historically wrote successfully then were lost from durable store (see overwrite root cause).",
      writesAssignedRecruiter: true,
    },
    {
      sourceId: "recruiting_apis",
      exists: true,
      currentlyPopulated: false,
      productionUsage:
        "POST /api/candidates/workflows (manual), POST .../auto-assign (P62 persist), P158 run endpoint.",
      lastWriter: "candidates workflows API",
      lastUpdate: live.auditLastAutoAssignAt,
      whyOwnershipMissing: "Live durable state shows Unassigned despite historical auto_assign audit volume.",
      writesAssignedRecruiter: true,
    },
    {
      sourceId: "workflow_persistence_ingestion_backfill",
      exists: true,
      currentlyPopulated: false,
      productionUsage:
        "backfillWorkflowRecordsForCandidates creates missing rows with assignedRecruiter='Unassigned' (ingestion_import).",
      lastWriter: "backfill-workflow-records / ingestion_import",
      lastUpdate: live.workflowStoreUpdatedAt,
      whyOwnershipMissing:
        "Create path never copies Breezy owner; concurrent full-file upserts can recreate Unassigned shells after auto-assign.",
      writesAssignedRecruiter: true,
    },
  ];
}

export function buildRootCauseFindings(live: {
  workflowsUnassigned: number;
  workflowsTotal: number;
  ingestionOwnerFieldsPresent: number;
  p158ProductionAssigned: number;
  auditNamedThenWipedEvidence: boolean;
  auditUniqueNamedCandidates: number;
  rapidWipeEvents: number;
}): P1883RootCauseFinding[] {
  return [
    {
      category: "schema_mismatch",
      primary: true,
      evidence: [
        "BreezyCandidate has no owner/assignee/recruiter fields after sanitizeCandidate",
        `Ingestion owner-like keys present: ${live.ingestionOwnerFieldsPresent}`,
        "UI join uses local assignedRecruiter only (build-candidate-workflow-row)",
      ],
      detail:
        "Breezy ownership is never mapped into the SRS candidate or workflow schema — primary upstream gap.",
    },
    {
      category: "never_imported",
      primary: true,
      evidence: [
        "backfillWorkflowRecordsForCandidates hardcodes assignedRecruiter: 'Unassigned' on create",
        "merge-candidate-record does not merge recruiter",
      ],
      detail: "Ingestion creates workflow ownership as Unassigned and never imports Breezy owners.",
    },
    {
      category: "overwritten",
      primary: true,
      evidence: [
        `Audit shows named auto_assign for ${live.auditUniqueNamedCandidates} current candidates while durable store is 100% Unassigned`,
        `Rapid wipe pattern (named then ingestion_import): ${live.rapidWipeEvents} observed pairings`,
        "candidate-workflow-store uses unlocked full-file read→mutate→write",
        "resolveAssignedRecruiter cannot preserve ownership when clobbering write believes record is new",
      ],
      detail:
        "P62/territory auto-assign historically persisted named recruiters, then concurrent ingestion_import / lost-update races wiped durable ownership back to Unassigned.",
    },
    {
      category: "disabled_feature",
      primary: false,
      evidence: [
        `P158 production assigned events: ${live.p158ProductionAssigned}`,
        "P158 requires P158_AUTOMATIC_ASSIGNMENTS_ENABLED=true and confirmAssignment=true",
      ],
      detail:
        "P158 durable production assignment never ran in this environment — cannot replenish wiped owners.",
    },
    {
      category: "missing_integration",
      primary: false,
      evidence: [
        "P188.2 extractBreezyAssignee finds nothing on sanitized ingestion rows",
        "P175 sourced_by_name not mapped to workflow assignedRecruiter",
      ],
      detail: "Enrichment and export paths lack a durable Breezy→workflow ownership integration.",
    },
    {
      category: "regression",
      primary: false,
      evidence: [
        live.auditNamedThenWipedEvidence
          ? "Historical audit proves ownership existed then disappeared from workflows"
          : "No wipe evidence",
        `Current Unassigned: ${live.workflowsUnassigned}/${live.workflowsTotal}`,
      ],
      detail:
        "Ownership disappearance is a durability regression (lost update / recreate), not an intentional policy to leave all Unassigned.",
    },
    {
      category: "never_persisted",
      primary: false,
      evidence: ["P158 simulations never became production assigned events"],
      detail: "Simulated recommendations were never persisted as authoritative ownership.",
    },
    {
      category: "imported_then_discarded",
      primary: false,
      evidence: [
        "sanitizeCandidate discards any raw Breezy owner/assignee before store write",
      ],
      detail: "If Breezy responses include owner, it is discarded at sanitize — never reaches `.data`.",
    },
    {
      category: "missing_migration",
      primary: false,
      evidence: [
        "No migration backfills assignedRecruiter from audit last-named values",
        "Workflow history currently shows only Unassigned transitions for recruiter changes",
      ],
      detail:
        "No authorized migration restores last durable named recruiter from audit into workflow rows.",
    },
  ];
}
