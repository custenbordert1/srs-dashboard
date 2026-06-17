import type {
  ExecutiveActionAuditEntry,
  ExecutiveActionStatus,
  ExecutiveTrackedAction,
} from "@/lib/executive-accountability/types";

export type AuditCenterRow = ExecutiveActionAuditEntry & {
  actionTitle: string;
  owner: string | null;
  actionStatus: ExecutiveActionStatus;
};

export type AuditCenterFilters = {
  owner?: string | null;
  status?: ExecutiveActionStatus | "all";
  startMs?: number;
  endMs?: number;
};

export function buildAuditCenterRows(input: {
  auditLog: ExecutiveActionAuditEntry[];
  actions: ExecutiveTrackedAction[];
}): AuditCenterRow[] {
  const actionById = new Map(input.actions.map((row) => [row.recommendationId, row]));

  return input.auditLog
    .map((entry) => {
      const action = actionById.get(entry.recommendationId);
      return {
        ...entry,
        actionTitle: action?.title ?? entry.recommendationId,
        owner: action?.owner ?? null,
        actionStatus: action?.status ?? "open",
      };
    })
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
}

export function filterAuditCenterRows(
  rows: AuditCenterRow[],
  filters: AuditCenterFilters,
): AuditCenterRow[] {
  return rows.filter((row) => {
    if (filters.owner && filters.owner !== "all") {
      const owner = row.owner?.trim() || "Unassigned";
      if (owner !== filters.owner) return false;
    }
    if (filters.status && filters.status !== "all" && row.actionStatus !== filters.status) {
      return false;
    }
    const changedMs = new Date(row.changedAt).getTime();
    if (filters.startMs !== undefined && changedMs < filters.startMs) return false;
    if (filters.endMs !== undefined && changedMs > filters.endMs) return false;
    return true;
  });
}

export function uniqueAuditOwners(rows: AuditCenterRow[]): string[] {
  return [...new Set(rows.map((row) => row.owner?.trim() || "Unassigned"))].sort();
}
