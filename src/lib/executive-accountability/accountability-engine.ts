import { isActiveExecutiveAction } from "@/lib/executive-accountability/action-audit";
import type {
  ExecutiveActionStatusSummary,
  ExecutiveTrackedAction,
  OwnerActionGroup,
} from "@/lib/executive-accountability/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getActiveActions(actions: ExecutiveTrackedAction[]): ExecutiveTrackedAction[] {
  return actions.filter(isActiveExecutiveAction);
}

/** Open actions past due date. */
export function detectOverdueActions(
  actions: ExecutiveTrackedAction[],
  referenceMs = Date.now(),
): ExecutiveTrackedAction[] {
  return actions.filter((action) => {
    if (!isActiveExecutiveAction(action)) return false;
    const due = new Date(action.dueDate).getTime();
    if (Number.isNaN(due)) return false;
    return due < referenceMs;
  });
}

/** Open actions with no update in 14+ days. */
export function detectStaleActions(
  actions: ExecutiveTrackedAction[],
  referenceMs = Date.now(),
  staleDays = 14,
): ExecutiveTrackedAction[] {
  const threshold = referenceMs - staleDays * MS_PER_DAY;
  return actions.filter((action) => {
    if (!isActiveExecutiveAction(action)) return false;
    const updated = new Date(action.updatedAt).getTime();
    return !Number.isNaN(updated) && updated <= threshold;
  });
}

export function groupActionsByOwner(actions: ExecutiveTrackedAction[]): OwnerActionGroup[] {
  const active = getActiveActions(actions);
  const groups = new Map<string, OwnerActionGroup>();

  for (const action of active) {
    const owner = action.owner?.trim() || "Unassigned";
    const entry = groups.get(owner) ?? {
      owner,
      open: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      actions: [],
    };
    entry.actions.push(action);
    if (action.status === "open") entry.open += 1;
    if (action.status === "in_progress") entry.inProgress += 1;
    groups.set(owner, entry);
  }

  const overdueIds = new Set(detectOverdueActions(actions).map((row) => row.recommendationId));
  for (const group of groups.values()) {
    group.overdue = group.actions.filter((row) => overdueIds.has(row.recommendationId)).length;
    group.actions.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }

  return [...groups.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}

export function summarizeActionStatus(
  actions: ExecutiveTrackedAction[],
  referenceMs = Date.now(),
): ExecutiveActionStatusSummary {
  const active = getActiveActions(actions);
  const overdue = detectOverdueActions(actions, referenceMs).length;
  const stale = detectStaleActions(actions, referenceMs).length;
  const open = active.filter((row) => row.status === "open").length;
  const inProgress = active.filter((row) => row.status === "in_progress").length;
  const completed = actions.filter((row) => row.status === "completed").length;
  const dismissed = actions.filter((row) => row.status === "dismissed").length;
  const archived = actions.filter((row) => row.status === "archived").length;
  const total = actions.length;
  const completionRate = calculateCompletionRate(actions);

  return {
    open,
    inProgress,
    completed,
    dismissed,
    archived,
    overdue,
    stale,
    total,
    completionRate,
  };
}

/** Completed / (completed + open + in_progress) — dismissed and archived excluded from denominator. */
export function calculateCompletionRate(actions: ExecutiveTrackedAction[]): number {
  const completed = actions.filter((row) => row.status === "completed").length;
  const active = actions.filter(
    (row) => row.status === "open" || row.status === "in_progress" || row.status === "completed",
  ).length;
  if (active === 0) return 0;
  return Math.round((completed / active) * 1000) / 10;
}
