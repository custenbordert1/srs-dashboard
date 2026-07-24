import type { P1863CandidateQueueItem } from "@/lib/p186-3-operator-lifecycle-queues/types";

export type P1863QueueFilters = {
  lifecycleState?: string | null;
  productionState?: string | null;
  recruiter?: string | null;
  dm?: string | null;
  job?: string | null;
  city?: string | null;
  state?: string | null;
  minAgeMs?: number | null;
  maxAgeMs?: number | null;
  blocker?: string | null;
  priority?: "high" | "medium" | "low" | null;
  sourceSystem?: string | null;
  mismatchType?: string | null;
  paperworkState?: string | null;
  onboardingState?: string | null;
  melReady?: boolean | null;
  search?: string | null;
  queueId?: string | null;
};

function includesCI(hay: string | null | undefined, needle: string): boolean {
  if (!hay) return false;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export function applyQueueFilters(
  items: P1863CandidateQueueItem[],
  filters?: P1863QueueFilters | null,
): P1863CandidateQueueItem[] {
  if (!filters) return items;
  return items.filter((item) => {
    if (filters.queueId && item.queueId !== filters.queueId) return false;
    if (filters.lifecycleState && item.shadowState !== filters.lifecycleState) return false;
    if (
      filters.productionState &&
      !includesCI(item.productionState, filters.productionState)
    ) {
      return false;
    }
    if (filters.recruiter && !includesCI(item.recruiter, filters.recruiter)) return false;
    if (filters.dm && !includesCI(item.dm, filters.dm)) return false;
    if (filters.job && !includesCI(item.jobTitle, filters.job)) return false;
    if (filters.city && !includesCI(item.city, filters.city)) return false;
    if (filters.state && !includesCI(item.state, filters.state)) return false;
    if (filters.minAgeMs != null && item.ageMs < filters.minAgeMs) return false;
    if (filters.maxAgeMs != null && item.ageMs > filters.maxAgeMs) return false;
    if (
      filters.blocker &&
      !item.blockers.some((b) => includesCI(b, filters.blocker!))
    ) {
      return false;
    }
    if (filters.priority && item.priority !== filters.priority) return false;
    if (
      filters.sourceSystem &&
      !includesCI(item.sourceSystemState, filters.sourceSystem)
    ) {
      return false;
    }
    if (filters.mismatchType) {
      if (!item.mismatch) return false;
      if (
        filters.mismatchType !== "any" &&
        item.mismatchKind !== filters.mismatchType
      ) {
        return false;
      }
    }
    if (
      filters.paperworkState &&
      !includesCI(item.paperworkState, filters.paperworkState)
    ) {
      return false;
    }
    if (
      filters.onboardingState &&
      !includesCI(item.onboardingState, filters.onboardingState)
    ) {
      return false;
    }
    if (filters.melReady != null && item.melReady !== filters.melReady) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const blob = [
        item.displayName,
        item.candidateId,
        item.jobTitle,
        item.city,
        item.state,
        item.recruiter,
        item.dm,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

export function sortQueueItems(
  items: P1863CandidateQueueItem[],
  sortBy: "age" | "priority" | "name" = "age",
  direction: "asc" | "desc" = "desc",
): P1863CandidateQueueItem[] {
  const dir = direction === "asc" ? 1 : -1;
  const priorityRank = { high: 3, medium: 2, low: 1 };
  return [...items].sort((a, b) => {
    if (sortBy === "name") {
      return a.displayName.localeCompare(b.displayName) * dir;
    }
    if (sortBy === "priority") {
      return (priorityRank[a.priority] - priorityRank[b.priority]) * dir;
    }
    return (a.ageMs - b.ageMs) * dir;
  });
}
