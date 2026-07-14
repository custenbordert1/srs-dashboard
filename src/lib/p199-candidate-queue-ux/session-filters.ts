import {
  P199_DEFAULT_FILTER_STATE,
  P199_DAYS_SINCE_APPLIED_OPTIONS,
  P199_QUEUE_SORT_OPTIONS,
  P199_SESSION_STORAGE_KEY,
  type P199QueueFilterState,
  type P199DaysSinceAppliedId,
  type P199QueueSortId,
  type P199SortableColumn,
} from "@/lib/p199-candidate-queue-ux/types";

function isDaysId(value: unknown): value is P199DaysSinceAppliedId {
  return P199_DAYS_SINCE_APPLIED_OPTIONS.some((o) => o.id === value);
}

function isSortId(value: unknown): value is P199QueueSortId {
  return P199_QUEUE_SORT_OPTIONS.some((o) => o.id === value);
}

function isSortableColumn(value: unknown): value is P199SortableColumn {
  return (
    value === "state" ||
    value === "city" ||
    value === "applied" ||
    value === "age" ||
    value === "owner" ||
    value === "confidence" ||
    value === "nearby"
  );
}

export function parseP199QueueFilterState(raw: unknown): P199QueueFilterState {
  if (!raw || typeof raw !== "object") return { ...P199_DEFAULT_FILTER_STATE };
  const obj = raw as Record<string, unknown>;
  const states = Array.isArray(obj.states)
    ? obj.states.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().toUpperCase())
    : [];
  const daysSinceApplied = isDaysId(obj.daysSinceApplied)
    ? obj.daysSinceApplied
    : P199_DEFAULT_FILTER_STATE.daysSinceApplied;
  const sort = isSortId(obj.sort) ? obj.sort : P199_DEFAULT_FILTER_STATE.sort;
  const headerColumn = isSortableColumn(obj.headerColumn) ? obj.headerColumn : null;
  const headerDirection = obj.headerDirection === "asc" || obj.headerDirection === "desc"
    ? obj.headerDirection
    : P199_DEFAULT_FILTER_STATE.headerDirection;
  return { states, daysSinceApplied, sort, headerColumn, headerDirection };
}

export function loadP199QueueFiltersFromSession(): P199QueueFilterState {
  if (typeof window === "undefined") return { ...P199_DEFAULT_FILTER_STATE };
  try {
    const raw = window.sessionStorage.getItem(P199_SESSION_STORAGE_KEY);
    if (!raw) return { ...P199_DEFAULT_FILTER_STATE };
    return parseP199QueueFilterState(JSON.parse(raw));
  } catch {
    return { ...P199_DEFAULT_FILTER_STATE };
  }
}

export function saveP199QueueFiltersToSession(state: P199QueueFilterState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(P199_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / private mode failures — filters still work in-memory.
  }
}
