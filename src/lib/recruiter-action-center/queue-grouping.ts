import type {
  ActionCenterCandidateRow,
  ActionCenterQueueSection,
  CandidatePriorityBand,
} from "@/lib/recruiter-action-center/types";

const SECTION_ORDER: ActionCenterQueueSection[] = [
  "work-now",
  "work-today",
  "work-this-week",
  "monitor",
];

export const QUEUE_SECTION_LABELS: Record<ActionCenterQueueSection, string> = {
  "work-now": "Work Now",
  "work-today": "Work Today",
  "work-this-week": "Work This Week",
  monitor: "Monitor",
};

export function resolveQueueSection(input: {
  priorityScore: number;
  priorityBand: CandidatePriorityBand;
  dueDate: string | null;
  referenceMs: number;
  followUpOverdue: boolean;
}): ActionCenterQueueSection {
  if (input.priorityScore >= 90 || input.priorityBand === "work-immediately" || input.followUpOverdue) {
    return "work-now";
  }

  if (input.dueDate) {
    const dueMs = Date.parse(input.dueDate);
    if (!Number.isNaN(dueMs)) {
      const diffDays = Math.ceil((dueMs - input.referenceMs) / (24 * 60 * 60 * 1000));
      if (diffDays <= 0) return "work-now";
      if (diffDays <= 1) return "work-today";
      if (diffDays <= 7) return "work-this-week";
    }
  }

  if (input.priorityScore >= 70 || input.priorityBand === "high") return "work-today";
  if (input.priorityScore >= 50 || input.priorityBand === "normal") return "work-this-week";
  return "monitor";
}

export function groupCandidatesIntoQueues(
  rows: ActionCenterCandidateRow[],
): Record<ActionCenterQueueSection, ActionCenterCandidateRow[]> {
  const grouped: Record<ActionCenterQueueSection, ActionCenterCandidateRow[]> = {
    "work-now": [],
    "work-today": [],
    "work-this-week": [],
    monitor: [],
  };

  for (const row of rows) {
    grouped[row.queueSection].push(row);
  }

  for (const section of SECTION_ORDER) {
    grouped[section].sort((a, b) => b.priorityScore - a.priorityScore);
  }

  return grouped;
}

export function pickWorkModeCandidate(
  rows: ActionCenterCandidateRow[],
  skippedCandidateIds: string[] = [],
): ActionCenterCandidateRow | null {
  const skipped = new Set(skippedCandidateIds);
  const ordered = [
    ...rows.filter((row) => row.queueSection === "work-now"),
    ...rows.filter((row) => row.queueSection === "work-today"),
    ...rows.filter((row) => row.queueSection === "work-this-week"),
    ...rows.filter((row) => row.queueSection === "monitor"),
  ];
  return ordered.find((row) => !skipped.has(row.candidateId)) ?? null;
}
