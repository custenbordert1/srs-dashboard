import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type { P1581WorkloadRow } from "@/lib/p158-assignment-simulation/types";

export function buildCurrentRecruiterLoads(
  workflows: Record<string, { assignedRecruiter?: string }>,
): Map<string, number> {
  const loads = new Map<string, number>();
  for (const wf of Object.values(workflows)) {
    const recruiter = wf.assignedRecruiter?.trim();
    if (!recruiter || isUnassignedRecruiter(recruiter)) continue;
    loads.set(recruiter, (loads.get(recruiter) ?? 0) + 1);
  }
  return loads;
}

export function buildWorkloadImpact(input: {
  currentLoads: Map<string, number>;
  queue: P158AssignmentQueueItem[];
  simulatedAssignments: P158AssignmentQueueItem[];
  rosterRecruiters: string[];
}): P1581WorkloadRow[] {
  const projectedAdds = new Map<string, number>();
  for (const item of input.simulatedAssignments) {
    if (!item.recommendedRecruiter) continue;
    projectedAdds.set(
      item.recommendedRecruiter,
      (projectedAdds.get(item.recommendedRecruiter) ?? 0) + 1,
    );
  }

  const recruiters = new Set([
    ...input.rosterRecruiters,
    ...input.currentLoads.keys(),
    ...projectedAdds.keys(),
  ]);

  const maxLoad = Math.max(
    1,
    ...[...input.currentLoads.values()],
    ...[...projectedAdds.entries()].map(([r, add]) => (input.currentLoads.get(r) ?? 0) + add),
  );

  const rows: P1581WorkloadRow[] = [];
  for (const recruiter of recruiters) {
    if (isUnassignedRecruiter(recruiter) || recruiter === "Recruiting Team") continue;
    const before = input.currentLoads.get(recruiter) ?? 0;
    const queuedInSimulation = projectedAdds.get(recruiter) ?? 0;
    const after = before + queuedInSimulation;
    rows.push({
      recruiter,
      before,
      after,
      delta: after - before,
      utilizationPercent: Math.round((after / maxLoad) * 100),
      queuedInSimulation,
    });
  }

  return rows.sort((a, b) => b.delta - a.delta || b.after - a.after);
}

export function findLargestWorkloadIncrease(
  rows: P1581WorkloadRow[],
): { recruiter: string; delta: number } | null {
  let top: P1581WorkloadRow | null = null;
  for (const row of rows) {
    if (row.delta <= 0) continue;
    if (!top || row.delta > top.delta) top = row;
  }
  return top ? { recruiter: top.recruiter, delta: top.delta } : null;
}

export function averageUtilization(rows: P1581WorkloadRow[]): number {
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((sum, r) => sum + r.utilizationPercent, 0) / rows.length);
}
