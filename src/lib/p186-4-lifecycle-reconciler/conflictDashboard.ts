import { runWriterConflictDetection } from "@/lib/p186-4-lifecycle-reconciler/detectors";
import { readP1864Flags } from "@/lib/p186-4-lifecycle-reconciler/flags";
import { recommendedFreezeOrder } from "@/lib/p186-4-lifecycle-reconciler/freezePlan";
import { runShadowLifecycleReconciler } from "@/lib/p186-4-lifecycle-reconciler/reconciler";
import { buildSchedulerCollisionReport } from "@/lib/p186-4-lifecycle-reconciler/schedulerCollision";
import { P1864_WRITER_REGISTRY } from "@/lib/p186-4-lifecycle-reconciler/writerRegistry";
import type {
  P1864ConflictDashboard,
  P1864ReconcileSourceSnapshot,
} from "@/lib/p186-4-lifecycle-reconciler/types";
import { P186_4_SOURCE_PHASE } from "@/lib/p186-4-lifecycle-reconciler/types";

function countBySeverity(
  findings: Array<{ severity: string }>,
  severity: string,
): number {
  return findings.filter((f) => f.severity === severity).length;
}

/**
 * Read-only conflict dashboard — no destructive controls.
 */
export function buildConflictDashboard(input?: {
  cohort?: P1864ReconcileSourceSnapshot[];
  forceFlags?: Partial<ReturnType<typeof readP1864Flags>>;
}): P1864ConflictDashboard {
  const flags = readP1864Flags(input?.forceFlags);
  const writerFindings = flags.writerInventoryReport || flags.conflictDashboard
    ? runWriterConflictDetection()
    : [];
  const scheduler = flags.schedulerCollisionAnalysis
    ? buildSchedulerCollisionReport()
    : { overlaps: [], recommendedCadence: { cadence: "disabled", rationale: "flag off", enabledNow: false as const } };

  const reconcile = flags.reconcilerExecution
    ? runShadowLifecycleReconciler({
        cohort: input?.cohort ?? [],
        forceFlags: { reconcilerExecution: true },
      })
    : { findings: [], detail: "reconciler flag off" };

  const findings = [
    ...writerFindings,
    ...(flags.schedulerCollisionAnalysis ? scheduler.overlaps : []),
  ];

  const allSeverities = [
    ...findings,
    ...reconcile.findings.map((f) => ({ severity: f.severity })),
  ];

  return {
    sourcePhase: P186_4_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    flags,
    summary: {
      totalWriters: P1864_WRITER_REGISTRY.length,
      authoritativeWriters: P1864_WRITER_REGISTRY.filter((w) => w.productionAuthoritative).length,
      shadowWriters: P1864_WRITER_REGISTRY.filter((w) => w.shadowOnly || w.sourceOfAuthority === "shadow").length,
      duplicateWriterGroups: writerFindings.filter((f) => f.kind === "duplicate_writer").length,
      schedulerOverlaps: scheduler.overlaps.length,
      missingOwnershipTransitions: writerFindings.filter((f) => f.kind === "unclear_ownership").length,
      deprecatedStillReferenced: P1864_WRITER_REGISTRY.filter(
        (w) => w.deprecationStatus === "deprecated_still_referenced",
      ).length,
      directMutationPaths: writerFindings.filter((f) => f.kind === "unsafe_direct_mutation").length,
      criticalFindings: countBySeverity(allSeverities, "critical"),
      highFindings: countBySeverity(allSeverities, "high"),
      mediumFindings: countBySeverity(allSeverities, "medium"),
      lowFindings: countBySeverity(allSeverities, "low"),
    },
    findings,
    reconcileFindings: reconcile.findings,
    freezeOrder: recommendedFreezeOrder(),
    recommendedCadence: scheduler.recommendedCadence.cadence,
  };
}

export function buildWriterInventoryReport(force = false): {
  ok: boolean;
  writers: typeof P1864_WRITER_REGISTRY;
  detail: string;
} {
  const flags = readP1864Flags(force ? { writerInventoryReport: true } : undefined);
  if (!flags.writerInventoryReport) {
    return { ok: false, writers: P1864_WRITER_REGISTRY, detail: "P186_WRITER_INVENTORY_REPORT flag is off" };
  }
  return {
    ok: true,
    writers: P1864_WRITER_REGISTRY,
    detail: `Inventory of ${P1864_WRITER_REGISTRY.length} writers (shadow registry only)`,
  };
}
