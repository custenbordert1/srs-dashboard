export const P199_DAYS_SINCE_APPLIED_OPTIONS = [
  { id: "all", label: "Any age" },
  { id: "today", label: "Today" },
  { id: "1", label: "1 Day" },
  { id: "2", label: "2 Days" },
  { id: "3-5", label: "3–5 Days" },
  { id: "6-10", label: "6–10 Days" },
  { id: "10+", label: "10+ Days" },
] as const;

export type P199DaysSinceAppliedId = (typeof P199_DAYS_SINCE_APPLIED_OPTIONS)[number]["id"];

export const P199_QUEUE_SORT_OPTIONS = [
  { id: "newest_applied", label: "Newest Applied" },
  { id: "oldest_applied", label: "Oldest Applied" },
  { id: "highest_ai", label: "Highest AI Score" },
  { id: "lowest_ai", label: "Lowest AI Score" },
  { id: "nearest_jobs", label: "Nearest Jobs" },
  { id: "confidence", label: "Confidence" },
] as const;

export type P199QueueSortId = (typeof P199_QUEUE_SORT_OPTIONS)[number]["id"];

/** Columns that support click-to-sort in the queue table. */
export type P199SortableColumn =
  | "state"
  | "city"
  | "applied"
  | "age"
  | "owner"
  | "confidence"
  | "nearby";

export type P199QueueFilterState = {
  states: string[];
  daysSinceApplied: P199DaysSinceAppliedId;
  sort: P199QueueSortId;
  /** Optional header-click override; when set, maps onto sort. */
  headerColumn: P199SortableColumn | null;
  headerDirection: "asc" | "desc";
};

export const P199_DEFAULT_FILTER_STATE: P199QueueFilterState = {
  states: [],
  daysSinceApplied: "all",
  sort: "newest_applied",
  headerColumn: null,
  headerDirection: "desc",
};

export const P199_SESSION_STORAGE_KEY = "p199-candidate-queue-filters";
