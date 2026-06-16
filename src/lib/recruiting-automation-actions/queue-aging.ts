import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";

export type AutomationQueueAgingBucketId = "0-3" | "4-7" | "8-14" | "15+";

export type AutomationQueueAgingBucket = {
  id: AutomationQueueAgingBucketId;
  label: string;
  count: number;
};

const QUEUE_STATUSES = new Set<RecruitingAutomationRecord["approvalStatus"]>([
  "Draft",
  "Pending Approval",
  "Approved",
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeQueueAgeDays(
  record: RecruitingAutomationRecord,
  referenceMs: number,
): number {
  const anchor = record.submittedAt ?? record.createdAt;
  return Math.max(0, Math.floor((referenceMs - Date.parse(anchor)) / MS_PER_DAY));
}

export function computeQueueAgingBucketId(ageDays: number): AutomationQueueAgingBucketId {
  if (ageDays <= 3) return "0-3";
  if (ageDays <= 7) return "4-7";
  if (ageDays <= 14) return "8-14";
  return "15+";
}

export function buildQueueAgingBuckets(
  records: RecruitingAutomationRecord[],
  referenceMs: number,
): AutomationQueueAgingBucket[] {
  const counts: Record<AutomationQueueAgingBucketId, number> = {
    "0-3": 0,
    "4-7": 0,
    "8-14": 0,
    "15+": 0,
  };

  for (const record of records) {
    if (!QUEUE_STATUSES.has(record.approvalStatus)) continue;
    const bucket = computeQueueAgingBucketId(computeQueueAgeDays(record, referenceMs));
    counts[bucket] += 1;
  }

  return [
    { id: "0-3", label: "0–3 days", count: counts["0-3"] },
    { id: "4-7", label: "4–7 days", count: counts["4-7"] },
    { id: "8-14", label: "8–14 days", count: counts["8-14"] },
    { id: "15+", label: "15+ days", count: counts["15+"] },
  ];
}
