import { P1864_SCHEDULER_REGISTRY } from "@/lib/p186-4-lifecycle-reconciler/writerRegistry";
import type {
  P1864ConflictFinding,
  P1864SchedulerRecord,
} from "@/lib/p186-4-lifecycle-reconciler/types";

function parseMinutes(cadence: string): number | null {
  const m = cadence.match(/(\d+)\s*m/i);
  if (m) return Number(m[1]);
  if (cadence.includes("*/10")) return 10;
  if (cadence.includes("*/5")) return 5;
  if (cadence.includes("7m") || cadence.includes("7 min")) return 7;
  if (cadence.includes("15m") || cadence.includes("15 min")) return 15;
  return null;
}

/**
 * Detect schedulers that can process overlapping candidate scopes on similar cadences.
 * Read-only — does not enable or disable any scheduler.
 */
export function detectSchedulerOverlaps(): P1864ConflictFinding[] {
  const findings: P1864ConflictFinding[] = [];
  const active = P1864_SCHEDULER_REGISTRY.filter((s) => s.type !== "webhook-retry");

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;
      const sharedWriters = a.relatedWriterIds.filter((id) => b.relatedWriterIds.includes(id));
      const sameSendScope =
        /paperwork|send|recruiting|pipeline|orchestrat/i.test(a.candidateScope) &&
        /paperwork|send|recruiting|pipeline|orchestrat/i.test(b.candidateScope);
      if (!sameSendScope && sharedWriters.length === 0) continue;

      const ma = parseMinutes(a.cadence);
      const mb = parseMinutes(b.cadence);
      const closeCadence =
        ma != null && mb != null ? Math.abs(ma - mb) <= 5 || ma === mb : true;

      if (!closeCadence && sharedWriters.length === 0) continue;

      const severity =
        a.overlapRisk === "critical" || b.overlapRisk === "critical"
          ? "critical"
          : a.duplicateProcessingRisk === "high" || b.duplicateProcessingRisk === "high"
            ? "high"
            : "medium";

      findings.push({
        id: `sched-${a.schedulerId}__${b.schedulerId}`,
        kind: "scheduler_overlap",
        severity,
        transition: "scheduler_collision",
        affectedCandidates: [],
        activeWriters: [...new Set([...a.relatedWriterIds, ...b.relatedWriterIds])],
        recommendedOwner: "p185-production-paperwork-runner",
        recommendedRetirementAction: `Do not run ${a.schedulerId} and ${b.schedulerId} concurrently; prefer single P185 cadence`,
        status: "open",
        assignedInvestigationOwner: null,
        detail: `${a.schedulerId} (${a.cadence}) overlaps ${b.schedulerId} (${b.cadence})`,
      });
    }
  }
  return findings;
}

export function recommendLifecycleReconciliationCadence(): {
  cadence: string;
  rationale: string;
  enabledNow: false;
} {
  return {
    cadence: "every 15 minutes (read-only reconcile) + event-driven observe on writes",
    rationale:
      "Aligns with P171 interval without enabling it; stays slower than P185 send cron; event-driven observe covers near-real-time drift.",
    enabledNow: false,
  };
}

export function buildSchedulerCollisionReport(): {
  schedulers: P1864SchedulerRecord[];
  overlaps: P1864ConflictFinding[];
  recommendedCadence: ReturnType<typeof recommendLifecycleReconciliationCadence>;
} {
  return {
    schedulers: [...P1864_SCHEDULER_REGISTRY],
    overlaps: detectSchedulerOverlaps(),
    recommendedCadence: recommendLifecycleReconciliationCadence(),
  };
}
