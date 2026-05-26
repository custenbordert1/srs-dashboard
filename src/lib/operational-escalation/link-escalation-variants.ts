import type { JobDraft } from "@/lib/job-management/job-draft-types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";

export type LinkedVariantDraft = {
  draft: JobDraft;
  lane: "pending" | "approved_unpublished" | "published" | "nearby_city";
};

export type EscalationVariantSummary = {
  related: LinkedVariantDraft[];
  pending: LinkedVariantDraft[];
  approvedUnpublished: LinkedVariantDraft[];
  published: LinkedVariantDraft[];
  nearbyCity: LinkedVariantDraft[];
};

function isRelatedVariant(draft: JobDraft, escalation: RecruiterEscalationQueueItem): boolean {
  if (!draft.variant) return false;
  const sourceId = draft.variant.sourceJobId || draft.clonedFromBreezyJobId;
  return sourceId === escalation.relatedJobId;
}

function classifyVariantLane(
  draft: JobDraft,
  escalation: RecruiterEscalationQueueItem,
): LinkedVariantDraft["lane"] | null {
  if (!isRelatedVariant(draft, escalation)) return null;

  const city = draft.variant?.cityTarget?.trim().toLowerCase() ?? draft.city.trim().toLowerCase();
  const escalationCity = escalation.city.trim().toLowerCase();
  const isNearby =
    city !== escalationCity &&
    draft.usState.trim().toUpperCase() === escalation.state.trim().toUpperCase();

  if (draft.variant?.queueStatus === "pending") return "pending";
  if (draft.variant?.queueStatus === "approved" && draft.status === "draft") {
    return "approved_unpublished";
  }
  if (draft.variant?.queueStatus === "published" || draft.status === "pushed") {
    return "published";
  }
  if (isNearby) return "nearby_city";
  return "pending";
}

export function linkEscalationVariants(
  escalation: RecruiterEscalationQueueItem,
  drafts: JobDraft[],
): EscalationVariantSummary {
  const related: LinkedVariantDraft[] = [];
  const pending: LinkedVariantDraft[] = [];
  const approvedUnpublished: LinkedVariantDraft[] = [];
  const published: LinkedVariantDraft[] = [];
  const nearbyCity: LinkedVariantDraft[] = [];

  for (const draft of drafts) {
    const lane = classifyVariantLane(draft, escalation);
    if (!lane) continue;
    const linked: LinkedVariantDraft = { draft, lane };
    related.push(linked);
    if (lane === "pending") pending.push(linked);
    else if (lane === "approved_unpublished") approvedUnpublished.push(linked);
    else if (lane === "published") published.push(linked);
    else if (lane === "nearby_city") nearbyCity.push(linked);
  }

  return { related, pending, approvedUnpublished, published, nearbyCity };
}
