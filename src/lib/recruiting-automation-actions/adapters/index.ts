import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";

export type AdapterResult = {
  ok: boolean;
  message: string;
  manualExecutionRequired: boolean;
};

export async function executeBreezyJobRefreshAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  const payload = record.payload;
  const title = "title" in payload ? payload.title : record.reason;
  const message = options?.previewOnly
    ? `Preview: would refresh Breezy job posting "${title}" in ${"location" in payload ? payload.location : "territory"}.`
    : `Manual execution required — Breezy job refresh for "${title}" is not validated for live API writes.`;
  return { ok: false, message, manualExecutionRequired: true };
}

export async function executeBreezyJobCreationAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  const payload = record.payload;
  const title = "title" in payload ? payload.title : record.reason;
  const location =
    "city" in payload && "state" in payload ? `${payload.city}, ${payload.state}` : record.territory;
  const message = options?.previewOnly
    ? `Preview: would create Breezy job posting "${title}" in ${location}.`
    : `Manual execution required — Breezy job creation for "${title}" is not validated for live API writes.`;
  return { ok: false, message, manualExecutionRequired: true };
}

export async function executeEmailCampaignAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  const payload = record.payload;
  const count = "candidates" in payload ? payload.candidates.length : 0;
  const message = options?.previewOnly
    ? `Preview: draft campaign to ${count} candidate(s) — no emails will be sent.`
    : `Manual execution required — email campaign to ${count} candidate(s) is not validated for live sends.`;
  return { ok: false, message, manualExecutionRequired: true };
}

export async function executeManualTaskAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  const payload = record.payload;
  const title = "title" in payload ? payload.title : record.reason;
  const message = options?.previewOnly
    ? `Preview: manual task "${title}" assigned to ${record.owner}.`
    : `Manual execution required — task "${title}" must be completed outside the automation system.`;
  return { ok: false, message, manualExecutionRequired: true };
}

export async function executeAutomationAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  switch (record.actionType) {
    case "job-refresh":
      return executeBreezyJobRefreshAdapter(record, options);
    case "create-posting":
      return executeBreezyJobCreationAdapter(record, options);
    case "follow-up-campaign":
      return executeEmailCampaignAdapter(record, options);
    case "manual-task":
      return executeManualTaskAdapter(record, options);
    default:
      return {
        ok: false,
        message: "Unknown automation action type.",
        manualExecutionRequired: true,
      };
  }
}
