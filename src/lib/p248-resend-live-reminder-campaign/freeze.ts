import type { P246CandidateEvaluation, P246PreviewReport } from "@/lib/p246-outstanding-paperwork-reminders/types";
import { buildP246IdempotencyKey } from "@/lib/p246-outstanding-paperwork-reminders/cadence";
import { hasIdempotencyKey, loadP246ReminderStore } from "@/lib/p246-outstanding-paperwork-reminders/store";
import {
  P248_CANARY_SIZE,
  P248_PHASE,
  type P248FrozenCohort,
  type P248FrozenCohortMember,
} from "@/lib/p248-resend-live-reminder-campaign/types";

const OUTSTANDING = new Set(["pending", "awaiting_signature", "viewed", "partially_signed"]);

export function isFrozenReminder1Eligible(row: P246CandidateEvaluation): boolean {
  if (!row.eligible) return false;
  if (row.nextReminderNumber !== 1) return false;
  if (!row.email || !row.signatureRequestId || !row.idempotencyKey) return false;
  if (!row.dropboxVerified || !row.dropboxLiveStatus) return false;
  if (!OUTSTANDING.has(row.dropboxLiveStatus)) return false;
  if (row.idempotencyKey !== buildP246IdempotencyKey(row.candidateId, row.signatureRequestId, 1)) {
    return false;
  }
  return true;
}

function pickCanaryIds(members: P248FrozenCohortMember[], size: number): string[] {
  const byPosition = new Map<string, P248FrozenCohortMember[]>();
  for (const m of members) {
    const key = (m.breezyPosition ?? "unknown").trim() || "unknown";
    const list = byPosition.get(key) ?? [];
    list.push(m);
    byPosition.set(key, list);
  }
  const positions = [...byPosition.keys()].sort();
  const picked: string[] = [];
  // Round-robin across positions for diversity
  let guard = 0;
  while (picked.length < size && guard < members.length * 2) {
    for (const pos of positions) {
      if (picked.length >= size) break;
      const list = byPosition.get(pos) ?? [];
      while (list.length > 0) {
        const next = list.shift()!;
        if (!picked.includes(next.candidateId)) {
          picked.push(next.candidateId);
          break;
        }
      }
    }
    guard += 1;
  }
  if (picked.length < size) {
    for (const m of members) {
      if (picked.length >= size) break;
      if (!picked.includes(m.candidateId)) picked.push(m.candidateId);
    }
  }
  return picked;
}

export async function freezeP248Reminder1Cohort(
  preview: P246PreviewReport,
): Promise<P248FrozenCohort> {
  const store = await loadP246ReminderStore();
  const members: P248FrozenCohortMember[] = [];

  for (const row of preview.evaluations) {
    if (!isFrozenReminder1Eligible(row)) continue;
    const key = row.idempotencyKey!;
    if (hasIdempotencyKey(store, row.candidateId, row.signatureRequestId!, key)) continue;
    members.push({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      firstName: row.firstName,
      email: row.email!,
      breezyPosition: row.breezyPosition,
      breezyStage: row.breezyStage,
      signatureRequestId: row.signatureRequestId!,
      dropboxLiveStatus: row.dropboxLiveStatus!,
      originalPaperworkSentAt: row.originalPaperworkSentAt,
      idempotencyKey: key,
      reminderNumber: 1,
      workflowStatus: row.workflowStatus,
      paperworkStatus: row.paperworkStatus,
    });
  }

  const canaryCandidateIds = pickCanaryIds(members, P248_CANARY_SIZE);
  const canarySet = new Set(canaryCandidateIds);
  const remainingCandidateIds = members
    .map((m) => m.candidateId)
    .filter((id) => !canarySet.has(id));

  return {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    previewGeneratedAt: preview.generatedAt,
    count: members.length,
    canaryCandidateIds,
    remainingCandidateIds,
    members,
  };
}
