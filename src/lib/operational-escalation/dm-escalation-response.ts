import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { OperationalEscalationType } from "@/lib/operational-escalation/operational-escalation-types";

/** Stable idempotency key — one open queue record per DM + job + escalation type. */
export function buildSourceEscalationLogId(
  dmUserId: string,
  relatedJobId: string,
  escalationType: OperationalEscalationType,
): string {
  return `${dmUserId}:${relatedJobId}:${escalationType}`;
}

/** DM-facing payload — excludes recruiter-internal notes and activity. */
export type DmEscalationQueuePublic = Omit<
  RecruiterEscalationQueueItem,
  "internalNotes" | "activity"
>;

export function toDmEscalationPublic(item: RecruiterEscalationQueueItem): DmEscalationQueuePublic {
  const { internalNotes: _notes, activity: _activity, ...rest } = item;
  return rest;
}
