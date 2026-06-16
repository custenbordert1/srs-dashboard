import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";

function resolveJobKey(record: RecruitingAutomationRecord): string {
  const payload = record.payload;
  if ("jobId" in payload && payload.jobId) return payload.jobId;
  if ("title" in payload && payload.title) return payload.title.toLowerCase().trim();
  return record.reason.toLowerCase().trim();
}

/** Same job + territory + action + owner → one draft. */
export function buildAutomationDuplicateKey(record: RecruitingAutomationRecord): string {
  const jobKey = resolveJobKey(record);
  const territory = (record.territory ?? "").toLowerCase().trim();
  const action = record.actionType;
  const owner = record.owner.toLowerCase().trim();
  return `${jobKey}|${territory}|${action}|${owner}`;
}

const WORKFLOW_PRIORITY: Record<RecruitingAutomationRecord["approvalStatus"], number> = {
  Draft: 0,
  "Pending Approval": 1,
  Approved: 2,
  Executing: 3,
  Completed: 4,
  Failed: 4,
  Cancelled: -1,
};

function workflowPriority(status: RecruitingAutomationRecord["approvalStatus"]): number {
  return WORKFLOW_PRIORITY[status] ?? 0;
}

function mergeDraftPair(
  primary: RecruitingAutomationRecord,
  secondary: RecruitingAutomationRecord,
): RecruitingAutomationRecord {
  const newer =
    Date.parse(secondary.updatedAt) > Date.parse(primary.updatedAt) ? secondary : primary;
  const older = newer === primary ? secondary : primary;
  const mergedAuditIds = new Set(primary.auditLog.map((row) => row.id));
  const extraAudit = secondary.auditLog.filter((row) => !mergedAuditIds.has(row.id));
  return {
    ...older,
    reason: newer.reason,
    expectedImpact: newer.expectedImpact,
    payload: newer.payload,
    sourceRecommendation: newer.sourceRecommendation ?? older.sourceRecommendation,
    auditLog: [...older.auditLog, ...extraAudit],
    updatedAt: new Date(
      Math.max(Date.parse(primary.updatedAt), Date.parse(secondary.updatedAt)),
    ).toISOString(),
  };
}

export function mergeDuplicateAutomations(
  records: RecruitingAutomationRecord[],
): RecruitingAutomationRecord[] {
  const byKey = new Map<string, RecruitingAutomationRecord>();

  for (const record of records) {
    if (record.approvalStatus !== "Draft") {
      byKey.set(`${buildAutomationDuplicateKey(record)}:${record.id}`, record);
      continue;
    }

    const key = buildAutomationDuplicateKey(record);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }

    const keep =
      workflowPriority(existing.approvalStatus) >= workflowPriority(record.approvalStatus)
        ? existing
        : record;
    const drop = keep === existing ? record : existing;
    if (keep.approvalStatus === "Draft" && drop.approvalStatus === "Draft") {
      byKey.set(key, mergeDraftPair(keep, drop));
    } else {
      byKey.set(key, keep);
    }
  }

  return [...byKey.values()];
}
