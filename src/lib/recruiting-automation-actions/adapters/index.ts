import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";

export type AdapterResult = {
  ok: boolean;
  message: string;
  manualExecutionRequired: boolean;
};

function simulatedExecutionMessage(
  record: RecruitingAutomationRecord,
  preview: boolean,
  detail: string,
): string {
  return preview
    ? `Preview: ${detail}`
    : `Simulated execution complete — ${detail} (no live Breezy/MEL calls).`;
}

export async function executeBreezyJobRefreshAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  const payload = record.payload;
  const title = "title" in payload ? payload.title : record.reason;
  const location = "location" in payload ? payload.location : "territory";
  const detail = `refreshed Breezy job posting "${title}" in ${location}`;
  return {
    ok: !options?.previewOnly,
    message: simulatedExecutionMessage(record, Boolean(options?.previewOnly), `would ${detail}`),
    manualExecutionRequired: false,
  };
}

export async function executeBreezyJobCreationAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  const payload = record.payload;
  const title = "title" in payload ? payload.title : record.reason;
  const location =
    "city" in payload && "state" in payload ? `${payload.city}, ${payload.state}` : record.territory;
  const detail = `created Breezy job posting "${title}" in ${location}`;
  return {
    ok: !options?.previewOnly,
    message: simulatedExecutionMessage(record, Boolean(options?.previewOnly), `would ${detail}`),
    manualExecutionRequired: false,
  };
}

export async function executeEmailCampaignAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  const payload = record.payload;
  const count = "candidates" in payload ? payload.candidates.length : 0;
  const detail = `draft campaign to ${count} candidate(s)`;
  return {
    ok: !options?.previewOnly,
    message: simulatedExecutionMessage(record, Boolean(options?.previewOnly), detail),
    manualExecutionRequired: false,
  };
}

export async function executeManualTaskAdapter(
  record: RecruitingAutomationRecord,
  options?: { previewOnly?: boolean },
): Promise<AdapterResult> {
  const payload = record.payload;
  const title = "title" in payload ? payload.title : record.reason;
  const detail = `manual task "${title}" assigned to ${record.owner}`;
  return {
    ok: !options?.previewOnly,
    message: simulatedExecutionMessage(record, Boolean(options?.previewOnly), detail),
    manualExecutionRequired: false,
  };
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
