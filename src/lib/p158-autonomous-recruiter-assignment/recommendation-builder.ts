import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";

export function sortAssignmentQueue(items: P158AssignmentQueueItem[]): P158AssignmentQueueItem[] {
  return [...items].sort(
    (a, b) =>
      b.priorityScore - a.priorityScore ||
      b.confidence - a.confidence ||
      a.candidateId.localeCompare(b.candidateId),
  );
}

export function pickNextAssignable(
  items: P158AssignmentQueueItem[],
  assignedCandidateIds: Set<string>,
): P158AssignmentQueueItem | null {
  for (const item of sortAssignmentQueue(items)) {
    if (item.status !== "queued") continue;
    if (!item.recommendedRecruiter) continue;
    if (assignedCandidateIds.has(item.candidateId)) continue;
    if (item.duplicateRisk) continue;
    return item;
  }
  return null;
}
