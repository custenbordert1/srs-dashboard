import { applyDropboxEventToP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/signatureAdapter";
import { planP193Reminder } from "@/lib/p193-simplified-autonomous-lifecycle/reminderEngine";
import { advanceToReadyForAssignment } from "@/lib/p193-simplified-autonomous-lifecycle/readyForAssignment";
import type { P193LifecycleRecord } from "@/lib/p193-simplified-autonomous-lifecycle/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P1932FrozenCohort } from "@/lib/p193-2-simplified-lifecycle-pilot/types";

export type P1932DropboxObserverRow = {
  candidateId: string;
  paperworkStatus: string | null;
  signatureRequestId: string | null;
  observed: "none" | "sent" | "viewed" | "signed" | "declined" | "expired" | "failed";
  simplifiedState: string | null;
};

export function observePilotDropboxStatuses(input: {
  cohort: P1932FrozenCohort;
  workflows: Record<string, CandidateWorkflowRecord>;
  records: Record<string, P193LifecycleRecord>;
}): {
  rows: P1932DropboxObserverRow[];
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = {
    none: 0,
    sent: 0,
    viewed: 0,
    signed: 0,
    declined: 0,
    expired: 0,
    failed: 0,
  };
  const rows: P1932DropboxObserverRow[] = [];

  for (const member of input.cohort.members) {
    const wf = input.workflows[member.candidateId];
    const ps = (wf?.paperworkStatus ?? "not_sent") as string;
    let observed: P1932DropboxObserverRow["observed"] = "none";
    if (ps === "sent") observed = "sent";
    else if (ps === "viewed") observed = "viewed";
    else if (ps === "signed") observed = "signed";
    else if (ps === "declined") observed = "declined";
    else if (ps === "failed") observed = "failed";

    let record = input.records[member.candidateId] ?? null;
    if (record && observed !== "none") {
      const event =
        observed === "signed"
          ? "signature_request_all_signed"
          : observed === "viewed"
            ? "signature_request_viewed"
            : observed === "sent"
              ? "signature_request_sent"
              : `signature_request_${observed}`;
      record = applyDropboxEventToP193Record({ record, eventType: event });
    }

    counts[observed] = (counts[observed] ?? 0) + 1;
    rows.push({
      candidateId: member.candidateId,
      paperworkStatus: wf?.paperworkStatus ?? null,
      signatureRequestId: wf?.signatureRequestId ?? null,
      observed,
      simplifiedState: record?.state ?? null,
    });
  }

  return { rows, counts };
}

export function previewPilotReminders(input: {
  records: P193LifecycleRecord[];
  nowMs?: number;
}): {
  buckets: Record<string, number>;
  plans: Array<{ candidateId: string; action: string; due: boolean; reason: string }>;
  reminderSendEnabled: false;
} {
  const buckets: Record<string, number> = {
    none: 0,
    reminder_1h: 0,
    reminder_24h: 0,
    reminder_48h: 0,
    expire_7d: 0,
  };
  const plans = input.records.map((r) => {
    const plan = planP193Reminder(r, input.nowMs);
    buckets[plan.action] = (buckets[plan.action] ?? 0) + 1;
    return {
      candidateId: r.candidateId,
      action: plan.action,
      due: plan.due,
      reason: plan.reason,
    };
  });
  return { buckets, plans, reminderSendEnabled: false };
}

export function projectPilotReadyForAssignment(input: {
  records: P193LifecycleRecord[];
  cityById?: Record<string, { city?: string; state?: string }>;
}): {
  advanced: Array<{ candidateId: string; ok: boolean; blockers: string[] }>;
  readyCount: number;
  melWrites: 0;
  autoAssignments: 0;
} {
  const advanced: Array<{ candidateId: string; ok: boolean; blockers: string[] }> = [];
  let readyCount = 0;
  for (const record of input.records) {
    if (record.state !== "Signed" && record.metadata.paperworkStatus !== "signed") {
      advanced.push({ candidateId: record.candidateId, ok: false, blockers: ["not_signed"] });
      continue;
    }
    const loc = input.cityById?.[record.candidateId];
    const result = advanceToReadyForAssignment({
      record,
      flags: {
        enabled: true,
        aiAutoQualifyEnabled: false,
        paperworkBridgeEnabled: false,
        reminderSendEnabled: false,
        readyForAssignmentEnabled: true,
      },
      authorized: true,
      city: loc?.city,
      state: loc?.state,
    });
    advanced.push({
      candidateId: record.candidateId,
      ok: result.advanced,
      blockers: result.blockers,
    });
    if (result.advanced) readyCount += 1;
  }
  return { advanced, readyCount, melWrites: 0, autoAssignments: 0 };
}
