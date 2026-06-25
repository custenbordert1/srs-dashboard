import type {
  RecruiterCommandCenterWorkItem,
  RecruiterWorkCategoryId,
} from "@/lib/recruiter-command-center/types";
import type { RecruiterPriorityLevel } from "@/lib/recruiter-priority";

export type CommandCenterQueueFilters = {
  searchQuery: string;
  priorityFilter: "all" | RecruiterPriorityLevel;
  categoryFilter: RecruiterWorkCategoryId | "all";
  actionFilter: string;
  coverageFilter: "all" | "urgent" | "healthy";
  overdueFilter: "all" | "overdue" | "current";
};

export function matchesCommandCenterFilters(
  item: RecruiterCommandCenterWorkItem,
  filters: CommandCenterQueueFilters,
): boolean {
  const query = filters.searchQuery.trim().toLowerCase();
  if (query) {
    const haystack = [
      item.candidateName,
      item.email ?? "",
      item.phone ?? "",
      item.positionName,
      item.recruiter,
      item.assignedDm,
      item.workflowStatus,
      item.nextAction,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  if (filters.priorityFilter !== "all" && item.priorityLevel !== filters.priorityFilter) {
    return false;
  }
  if (filters.categoryFilter !== "all" && item.category !== filters.categoryFilter) {
    return false;
  }
  if (filters.actionFilter !== "all" && item.nextAction !== filters.actionFilter) {
    return false;
  }
  if (filters.coverageFilter === "urgent" && !item.coverageUrgent) return false;
  if (filters.coverageFilter === "healthy" && item.coverageUrgent) return false;
  if (filters.overdueFilter === "overdue" && !item.actionOverdue) return false;
  if (filters.overdueFilter === "current" && item.actionOverdue) return false;
  return true;
}

export function filterCommandCenterWorkQueue(
  items: RecruiterCommandCenterWorkItem[],
  filters: CommandCenterQueueFilters,
): RecruiterCommandCenterWorkItem[] {
  return items.filter((item) => matchesCommandCenterFilters(item, filters));
}
