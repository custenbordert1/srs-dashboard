import type {
  ActivityTimelineEntry,
  OperationsFilter,
  OperationsTimeRange,
} from "@/lib/p126-autonomous-operations-command-center/types";

function rangeStart(timeRange: OperationsTimeRange): number | null {
  const now = Date.now();
  switch (timeRange) {
    case "today":
      return new Date().setHours(0, 0, 0, 0);
    case "yesterday": {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      return start.getTime();
    }
    case "last7days":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "lastHour":
      return now - 60 * 60 * 1000;
    default:
      return null;
  }
}

export function filterActivityTimeline(
  entries: ActivityTimelineEntry[],
  filter: OperationsFilter,
): ActivityTimelineEntry[] {
  let result = [...entries];
  const timeRange = filter.timeRange ?? "today";
  const start = rangeStart(timeRange);
  if (start != null) {
    result = result.filter((entry) => Date.parse(entry.at) >= start);
  }

  if (filter.errorsOnly) {
    result = result.filter(
      (entry) =>
        /fail|error|blocked|no-go|rejected/i.test(entry.result) ||
        /fail|error|blocked/i.test(entry.reason ?? ""),
    );
  }

  if (filter.candidateQuery?.trim()) {
    const q = filter.candidateQuery.trim().toLowerCase();
    result = result.filter(
      (entry) =>
        entry.candidateId?.toLowerCase().includes(q) ||
        entry.candidateName?.toLowerCase().includes(q),
    );
  }

  if (filter.failureReason?.trim()) {
    const q = filter.failureReason.trim().toLowerCase();
    result = result.filter((entry) => entry.reason?.toLowerCase().includes(q));
  }

  return result;
}

export function filterCandidateSummaries<T extends { candidateId: string; candidateName: string; email: string; approvalDecision: string; eligibilityStatus: string }>(
  candidates: T[],
  filter: OperationsFilter,
): T[] {
  let result = [...candidates];

  if (filter.candidateQuery?.trim()) {
    const q = filter.candidateQuery.trim().toLowerCase();
    result = result.filter(
      (c) =>
        c.candidateId.toLowerCase().includes(q) ||
        c.candidateName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }

  if (filter.approvalDecision?.trim()) {
    result = result.filter((c) => c.approvalDecision === filter.approvalDecision);
  }

  if (filter.status?.trim()) {
    result = result.filter((c) => c.eligibilityStatus === filter.status);
  }

  return result;
}
