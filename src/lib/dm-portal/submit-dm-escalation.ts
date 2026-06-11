import type { UserPublic } from "@/lib/auth/types";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import type { DmEscalationActionType, DmJobOperationalDetail } from "@/lib/dm-dashboard/dm-operational-types";
import { DM_ESCALATION_ACTION_LABELS } from "@/lib/dm-dashboard/dm-operational-types";
import type { DmEscalationLogEntry } from "@/lib/dm-dashboard/dm-operational-types";
import { appendDmEscalationLog } from "@/lib/dm-escalation-store";
import { buildSourceEscalationLogId } from "@/lib/operational-escalation/dm-escalation-response";

export type SubmitDmEscalationInput = {
  actionType: DmEscalationActionType;
  job: DmJobOperationalDetail;
  user: Pick<UserPublic, "id" | "name" | "territoryStates">;
  relatedAlert?: DmPrioritizedAlert | null;
};

export type SubmitDmEscalationResult =
  | { ok: true; entry: DmEscalationLogEntry }
  | { ok: false; error: string };

export async function submitDmEscalation(input: SubmitDmEscalationInput): Promise<SubmitDmEscalationResult> {
  const { actionType, job, user, relatedAlert } = input;
  const entry: DmEscalationLogEntry = {
    id: `dm-esc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actionType,
    label: DM_ESCALATION_ACTION_LABELS[actionType],
    jobId: job.jobId,
    jobTitle: job.title,
    city: job.city,
    state: job.state,
    dmUserId: user.id,
    dmUserName: user.name,
    territoryStates: user.territoryStates,
    createdAt: new Date().toISOString(),
  };

  appendDmEscalationLog(entry);

  const sourceEscalationLogId = buildSourceEscalationLogId(user.id, job.jobId, actionType);
  try {
    const res = await fetch("/api/dm/escalations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceEscalationLogId,
        escalationType: actionType,
        relatedJobId: job.jobId,
        jobTitle: job.title,
        city: job.city,
        state: job.state,
        priority: job.priority ?? relatedAlert?.priority ?? null,
        priorityScore: job.priorityScore ?? relatedAlert?.priorityScore ?? null,
        recommendedAction: job.recommendedAction ?? relatedAlert?.recommendedAction ?? entry.label,
        alertReason: relatedAlert?.title ?? entry.label,
        jobAgeDays: job.jobAgeDays,
      }),
    });
    const parsed = (await res.json()) as { ok?: boolean; error?: string };
    if (!parsed.ok) {
      return { ok: false, error: parsed.error ?? "Could not send escalation to recruiting." };
    }
    return { ok: true, entry };
  } catch {
    return { ok: false, error: "Escalation saved locally but recruiter queue sync failed." };
  }
}
