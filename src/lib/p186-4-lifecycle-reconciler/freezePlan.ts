import { P1864_WRITER_REGISTRY } from "@/lib/p186-4-lifecycle-reconciler/writerRegistry";
import type { P1864FreezePlanItem } from "@/lib/p186-4-lifecycle-reconciler/types";

/**
 * Freeze/retirement plan builder — plans only.
 * disabledNow is always false in P186.4.
 */
export function buildFreezePlan(): P1864FreezePlanItem[] {
  const prioritized = [...P1864_WRITER_REGISTRY]
    .filter(
      (w) =>
        w.retirementRecommendation === "freeze_later" ||
        w.retirementRecommendation === "retire_later" ||
        w.writerId === "p1547-continuous-recruiting-runner" ||
        w.writerId === "p169-recruiting-orchestrator" ||
        w.writerId === "p171-lifecycle-manager",
    )
    .sort((a, b) => {
      const rank = (id: string) => {
        if (id.startsWith("p154")) return 1;
        if (id.startsWith("p169")) return 2;
        if (id.startsWith("p171")) return 3;
        if (id.startsWith("p125") || id.startsWith("p136") || id.startsWith("p106")) return 4;
        if (id.startsWith("p148") || id.startsWith("p84") || id.startsWith("p183")) return 5;
        return 6;
      };
      return rank(a.writerId) - rank(b.writerId) || a.priority - b.priority;
    });

  return prioritized.map((w, idx) => {
    const disableFlag =
      w.featureFlag ??
      `P186_FREEZE_${w.writerId.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`;
    return {
      writerId: w.writerId,
      currentRole: w.productionUsage,
      replacementPath:
        w.conflictGroup === "paperwork_send"
          ? "P185 cron → P184 send engine → onboarding send queue"
          : w.conflictGroup === "continuous_orchestration"
            ? "Single future P186 control plane (post cutover) + P185 send path"
            : w.conflictGroup === "parallel_lifecycle_store"
              ? "P186.1 shadow FSM as sole parallel store; retire P171 store writes"
              : "Designate via ownership matrix recommended owner",
      shadowObservationPeriod: "minimum 14 days with P186.2 observe + P186.4 reconciler",
      disableFlag,
      rollbackFlag: `${disableFlag}_ROLLBACK`,
      cutoverPrerequisite:
        "Zero critical reconciliation findings for freeze cohort; P184/P185 isolation verified; operator sign-off",
      monitoringRequirement:
        "Queue aging, duplicate-send rate, shadow mismatch count, production write failures",
      rollbackProcedure: `Re-enable ${disableFlag}; pause replacement path; re-run read-only reconciler; do not auto-repair production`,
      freezeOrder: idx + 1,
      disabledNow: false,
    };
  });
}

export function buildRollbackPlanSummary(items: P1864FreezePlanItem[]): {
  items: Array<{ writerId: string; rollbackFlag: string; procedure: string }>;
  note: string;
} {
  return {
    items: items.map((i) => ({
      writerId: i.writerId,
      rollbackFlag: i.rollbackFlag,
      procedure: i.rollbackProcedure,
    })),
    note: "P186.4 does not disable writers. Rollback flags are documentation only until a future authorized freeze phase.",
  };
}

export function recommendedFreezeOrder(): string[] {
  return buildFreezePlan().map((i) => i.writerId);
}
