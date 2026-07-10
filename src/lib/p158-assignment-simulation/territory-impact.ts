import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type { P1581TerritoryHeatCell } from "@/lib/p158-assignment-simulation/types";

export function buildTerritoryHeatMap(input: {
  queue: P158AssignmentQueueItem[];
  simulatedAssignments: P158AssignmentQueueItem[];
}): P1581TerritoryHeatCell[] {
  const byTerritory = new Map<string, P1581TerritoryHeatCell>();
  const assignedIds = new Set(input.simulatedAssignments.map((i) => i.candidateId));

  for (const item of input.queue) {
    const key = item.territory ?? item.state ?? "Unknown";
    const existing = byTerritory.get(key) ?? {
      territory: key,
      dm: item.dm,
      openDemand: item.openDemand,
      unassignedBefore: 0,
      unassignedAfter: 0,
      assignedInSimulation: 0,
      imbalanceScore: 0,
    };

    if (isUnassignedRecruiter(item.assignedRecruiter)) {
      existing.unassignedBefore += 1;
      if (!assignedIds.has(item.candidateId)) {
        existing.unassignedAfter += 1;
      }
    }

    if (assignedIds.has(item.candidateId)) {
      existing.assignedInSimulation += 1;
    }

    existing.openDemand = Math.max(existing.openDemand, item.openDemand);
    byTerritory.set(key, existing);
  }

  const cells = [...byTerritory.values()];
  const maxUnassigned = Math.max(1, ...cells.map((c) => c.unassignedBefore));

  for (const cell of cells) {
    const demandFactor = Math.min(40, cell.openDemand / 10);
    const remainingFactor = (cell.unassignedAfter / maxUnassigned) * 40;
    const assignedRelief = cell.assignedInSimulation > 0 ? 10 : 0;
    cell.imbalanceScore = Math.round(Math.min(100, demandFactor + remainingFactor + 30 - assignedRelief));
  }

  return cells.sort(
    (a, b) => b.imbalanceScore - a.imbalanceScore || b.unassignedBefore - a.unassignedBefore,
  );
}

export function computeTerritoryImbalanceScore(cells: P1581TerritoryHeatCell[]): number {
  if (cells.length === 0) return 0;
  return Math.round(cells.reduce((sum, c) => sum + c.imbalanceScore, 0) / cells.length);
}
