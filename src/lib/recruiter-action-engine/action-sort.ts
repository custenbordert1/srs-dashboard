import type { RecruiterActionPriority } from "@/lib/recruiter-action-engine/types";

export function todayDateIso(referenceMs = Date.now()): string {
  return new Date(referenceMs).toISOString().slice(0, 10);
}

export function isActionOverdue(actionDueDate: string | null | undefined, referenceMs = Date.now()): boolean {
  if (!actionDueDate) return false;
  return actionDueDate < todayDateIso(referenceMs);
}

export function isActionDueToday(actionDueDate: string | null | undefined, referenceMs = Date.now()): boolean {
  if (!actionDueDate) return false;
  return actionDueDate === todayDateIso(referenceMs);
}

const PRIORITY_RANK: Record<RecruiterActionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function recruiterActionSortKey(input: {
  actionDueDate?: string | null;
  actionPriority?: RecruiterActionPriority | null;
  referenceMs?: number;
}): number {
  const referenceMs = input.referenceMs ?? Date.now();
  const due = input.actionDueDate;
  if (due && isActionOverdue(due, referenceMs)) return 0;
  if (due && isActionDueToday(due, referenceMs)) return 100;
  const pri = input.actionPriority ?? "low";
  return 200 + PRIORITY_RANK[pri] * 10;
}

export function compareRecruiterActionPriority(
  a: { actionDueDate?: string | null; actionPriority?: RecruiterActionPriority | null; candidateId?: string },
  b: { actionDueDate?: string | null; actionPriority?: RecruiterActionPriority | null; candidateId?: string },
  referenceMs = Date.now(),
): number {
  const keyDiff = recruiterActionSortKey({ ...a, referenceMs }) - recruiterActionSortKey({ ...b, referenceMs });
  if (keyDiff !== 0) return keyDiff;
  const dueA = a.actionDueDate ?? "";
  const dueB = b.actionDueDate ?? "";
  return dueA.localeCompare(dueB) || (a.candidateId ?? "").localeCompare(b.candidateId ?? "");
}

export function formatActionDueLabel(actionDueDate: string | null | undefined, referenceMs = Date.now()): string {
  if (!actionDueDate) return "—";
  if (isActionOverdue(actionDueDate, referenceMs)) return "Overdue";
  if (isActionDueToday(actionDueDate, referenceMs)) return "Today";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${actionDueDate}T12:00:00Z`));
  } catch {
    return actionDueDate;
  }
}

export const ACTION_PRIORITY_STYLES: Record<RecruiterActionPriority, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-100",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  low: "border-zinc-600 bg-zinc-900/60 text-zinc-300",
};
