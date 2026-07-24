/**
 * Multi-select helpers for bulk operations.
 * Bulk sends are never permitted — callers must use preview/confirm paths only.
 */

export function toggleSelection(
  selectedIds: readonly string[],
  candidateId: string,
): string[] {
  if (selectedIds.includes(candidateId)) {
    return selectedIds.filter((id) => id !== candidateId);
  }
  return [...selectedIds, candidateId];
}

export function selectAllVisible(
  visibleIds: readonly string[],
  selectedIds: readonly string[],
): string[] {
  const set = new Set(selectedIds);
  for (const id of visibleIds) set.add(id);
  return [...set];
}

export function clearSelection(): string[] {
  return [];
}

export function invertSelection(
  visibleIds: readonly string[],
  selectedIds: readonly string[],
): string[] {
  const selected = new Set(selectedIds);
  const next: string[] = [];
  for (const id of selectedIds) {
    if (!visibleIds.includes(id)) next.push(id);
  }
  for (const id of visibleIds) {
    if (!selected.has(id)) next.push(id);
  }
  return next;
}

export function selectionSummary(
  selectedIds: readonly string[],
  visibleIds: readonly string[],
): {
  selectedCount: number;
  visibleSelectedCount: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
} {
  const selected = new Set(selectedIds);
  let visibleSelectedCount = 0;
  for (const id of visibleIds) {
    if (selected.has(id)) visibleSelectedCount += 1;
  }
  return {
    selectedCount: selectedIds.length,
    visibleSelectedCount,
    allVisibleSelected: visibleIds.length > 0 && visibleSelectedCount === visibleIds.length,
    someVisibleSelected: visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length,
  };
}

/** Reject bulk send intents — hard safety rule for P259. */
export function assertBulkActionAllowed(
  actionId: string,
): { ok: true } | { ok: false; reason: string } {
  const blocked = new Set([
    "bulk_send",
    "send_all",
    "send_paperwork_bulk",
    "send_reminder_bulk",
    "bulk_sms",
  ]);
  if (blocked.has(actionId)) {
    return { ok: false, reason: "Bulk sends are not allowed in P259." };
  }
  return { ok: true };
}

export function buildExportCsv(
  rows: Array<{
    candidateId: string;
    displayName: string;
    email: string;
    phone: string;
    hiringScore: number;
    workflowStatus: string;
    paperworkStatus: string;
    recruiter: string;
    dm: string;
    distanceMiles: number | null;
  }>,
): string {
  const header = [
    "candidateId",
    "displayName",
    "email",
    "phone",
    "hiringScore",
    "workflowStatus",
    "paperworkStatus",
    "recruiter",
    "dm",
    "distanceMiles",
  ];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escape(row.candidateId),
        escape(row.displayName),
        escape(row.email),
        escape(row.phone),
        String(row.hiringScore),
        escape(row.workflowStatus),
        escape(row.paperworkStatus),
        escape(row.recruiter),
        escape(row.dm),
        row.distanceMiles == null ? "" : String(Math.round(row.distanceMiles)),
      ].join(","),
    );
  }
  return lines.join("\n");
}
