import {
  assertOwnershipCompleteness,
  buildArchitectureDoc,
  P1867_OWNERSHIP_MATRIX,
} from "@/lib/p186-7-lifecycle-cutover/ownershipMatrix";
import {
  createDefaultWriterControlRegistry,
  type WriterControlRegistry,
} from "@/lib/p186-7-lifecycle-cutover/writerControlRegistry";
import {
  classifyFreezeReadiness,
  getFreezeOrder,
  type FreezeGateContext,
} from "@/lib/p186-7-lifecycle-cutover/freezeControls";
import {
  evaluateCutoverReadinessGates,
  resolveAllowedStage,
  type ReadinessInput,
} from "@/lib/p186-7-lifecycle-cutover/cutoverStages";
import {
  emptyShadowParityReport,
  type ShadowObservationRow,
  buildShadowParityReport,
} from "@/lib/p186-7-lifecycle-cutover/shadowParity";
import { buildRollbackPlans } from "@/lib/p186-7-lifecycle-cutover/rollbackFramework";
import { buildSchedulerConsolidationPlan } from "@/lib/p186-7-lifecycle-cutover/schedulerPlan";
import { buildRepositoryRetirementPlan } from "@/lib/p186-7-lifecycle-cutover/retirementPlan";
import { readP1867Flags, hasGlobalAuthoritativeFlag } from "@/lib/p186-7-lifecycle-cutover/flags";
import {
  P1867_IMPLEMENTED_MAX_STAGE,
  P186_7_SOURCE_PHASE,
  type P1867CutoverStage,
  type P1867ShadowParityReport,
} from "@/lib/p186-7-lifecycle-cutover/types";

export type P1867CutoverDashboard = {
  sourcePhase: typeof P186_7_SOURCE_PHASE;
  generatedAt: string;
  currentCutoverStage: P1867CutoverStage;
  maxImplementedStage: typeof P1867_IMPLEMENTED_MAX_STAGE;
  authoritativeWriterByTransition: Array<{ transition: string; writer: string }>;
  writersActive: string[];
  writersFreezePending: string[];
  writersFrozen: string[];
  shadowParity: P1867ShadowParityReport;
  criticalMismatches: number;
  schedulerOverlaps: string[];
  rollbackReadiness: Array<{ group: string; ready: boolean }>;
  p184P185Isolation: boolean;
  latestOperatorApproval: string | null;
  nextRequiredAction: string;
  readinessGates: ReturnType<typeof evaluateCutoverReadinessGates>;
  freezeReady: string[];
  freezeBlocked: Array<{ writerId: string; reasons: string[] }>;
  architecture: ReturnType<typeof buildArchitectureDoc>;
  ownershipOk: boolean;
  safety: {
    productionWritesAttempted: 0;
    paperworkSendsAttempted: 0;
    melWritesAttempted: 0;
    writersActuallyDisabled: 0;
    schedulerActivated: false;
    p186Authoritative: false;
    globalAuthoritativeFlagPresent: boolean;
  };
  destructiveControlsEnabled: false;
};

export type BuildCutoverDashboardInput = {
  stage?: P1867CutoverStage;
  registry?: WriterControlRegistry;
  shadowRows?: ShadowObservationRow[];
  shadowParity?: P1867ShadowParityReport;
  gateByWriter?: Record<string, Omit<FreezeGateContext, "writerId">>;
  readinessOverrides?: Partial<ReadinessInput>;
  latestOperatorApproval?: string | null;
  forceFlags?: Partial<ReturnType<typeof readP1867Flags>>;
};

/**
 * Read-only cutover dashboard — no destructive controls.
 */
export function buildCutoverDashboard(
  input: BuildCutoverDashboardInput = {},
): P1867CutoverDashboard | { enabled: false; message: string; flags: ReturnType<typeof readP1867Flags> } {
  const flags = readP1867Flags(input.forceFlags);
  if (!flags.cutoverDashboard) {
    return {
      enabled: false,
      message: "P186_CUTOVER_DASHBOARD flag is off",
      flags,
    };
  }

  const requested = input.stage ?? "stage_0_shadow_only";
  const stageRes = resolveAllowedStage(requested);
  const registry = input.registry ?? createDefaultWriterControlRegistry();
  const writers = registry.list();
  const shadowParity =
    input.shadowParity ??
    (input.shadowRows ? buildShadowParityReport(input.shadowRows) : emptyShadowParityReport());

  const { freezeReady, freezeBlocked } = classifyFreezeReadiness(
    registry,
    input.gateByWriter ?? {},
  );

  const readinessInput: ReadinessInput = {
    shadowParity,
    unresolvedLifecycleOperations: 0,
    duplicateWriterWritesInWindow: shadowParity.duplicateWriterEvents,
    neonHealthy: true,
    schemaHealthy: true,
    eventIngestionHealthy: true,
    reconcilerHealthy: true,
    workflowAdapterHealthy: true,
    auditPersistenceHealthy: true,
    rollbackTested: true,
    operatorDashboardReviewed: false,
    executiveDashboardReviewed: false,
    p184P185Isolated: true,
    paperworkModeDryRun: true,
    automaticMelExportDisabled: true,
    ...input.readinessOverrides,
  };
  const readinessGates = evaluateCutoverReadinessGates(readinessInput);

  const ownership = assertOwnershipCompleteness();
  const scheduler = buildSchedulerConsolidationPlan();
  const rollbacks = buildRollbackPlans();

  const nextRequiredAction = !ownership.ok
    ? "Resolve ownership matrix gaps"
    : shadowParity.criticalMismatches > 0
      ? "Resolve critical shadow mismatches before any canary"
      : !readinessGates.ok
        ? "Complete failing cutover readiness gates"
        : stageRes.stage === "stage_0_shadow_only"
          ? "Enable Stage 1 read-only dashboards/health after operator review"
          : "Await explicit operator authorization before Stage 2 single-transition canary";

  return {
    sourcePhase: P186_7_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    currentCutoverStage: stageRes.stage,
    maxImplementedStage: P1867_IMPLEMENTED_MAX_STAGE,
    authoritativeWriterByTransition: P1867_OWNERSHIP_MATRIX.map((r) => ({
      transition: r.transition,
      writer: r.futureAuthoritativeWriter,
    })),
    writersActive: writers.filter((w) => w.currentStatus === "active").map((w) => w.writerId),
    writersFreezePending: writers
      .filter((w) => w.desiredStatus === "freeze_pending" || w.currentStatus === "freeze_pending")
      .map((w) => w.writerId),
    writersFrozen: writers.filter((w) => w.currentStatus === "frozen").map((w) => w.writerId),
    shadowParity,
    criticalMismatches: shadowParity.criticalMismatches,
    schedulerOverlaps: scheduler.overlapsRemaining,
    rollbackReadiness: rollbacks.map((r) => ({
      group: r.transitionGroup,
      ready: r.forbids.length === 4,
    })),
    p184P185Isolation: readinessInput.p184P185Isolated,
    latestOperatorApproval: input.latestOperatorApproval ?? null,
    nextRequiredAction,
    readinessGates,
    freezeReady: freezeReady.map((f) => f.writerId),
    freezeBlocked: freezeBlocked.map((f) => ({
      writerId: f.writerId,
      reasons: f.blockedReasons,
    })),
    architecture: buildArchitectureDoc(),
    ownershipOk: ownership.ok,
    safety: {
      productionWritesAttempted: 0,
      paperworkSendsAttempted: 0,
      melWritesAttempted: 0,
      writersActuallyDisabled: 0,
      schedulerActivated: false,
      p186Authoritative: false,
      globalAuthoritativeFlagPresent: hasGlobalAuthoritativeFlag(),
    },
    destructiveControlsEnabled: false,
  };
}

export function buildCutoverValidationSummary(input: BuildCutoverDashboardInput = {}) {
  const dash = buildCutoverDashboard({
    ...input,
    forceFlags: { cutoverDashboard: true, ...input.forceFlags },
  });
  if ("enabled" in dash && dash.enabled === false) {
    throw new Error("Expected dashboard enabled for validation");
  }
  const d = dash as P1867CutoverDashboard;
  const ownership = assertOwnershipCompleteness();
  const retirement = buildRepositoryRetirementPlan();
  return {
    lifecycleTransitionsMapped: P1867_OWNERSHIP_MATRIX.length,
    transitionsWithOneFutureOwner: ownership.ok
      ? P1867_OWNERSHIP_MATRIX.length
      : P1867_OWNERSHIP_MATRIX.length - ownership.multiOwner.length - ownership.missing.length,
    transitionsWithUnresolvedOwnership: [...ownership.missing, ...ownership.multiOwner],
    activeDuplicateWriters: d.writersFreezePending.length,
    freezeReadyWriters: d.freezeReady,
    freezeBlockedWriters: d.freezeBlocked,
    shadowParityRate: d.shadowParity.matchRate,
    criticalMismatches: d.criticalMismatches,
    rollbackReadyTransitionGroups: d.rollbackReadiness.filter((r) => r.ready).map((r) => r.group),
    schedulerOverlapsRemaining: d.schedulerOverlaps,
    productionWritesAttempted: 0,
    paperworkSendsAttempted: 0,
    melWritesAttempted: 0,
    writersActuallyDisabled: 0,
    freezeOrder: getFreezeOrder(),
    retirementItems: retirement.length,
    nothingDeleted: retirement.every((i) => !i.deletedNow),
  };
}
