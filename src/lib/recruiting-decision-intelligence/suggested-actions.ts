import type { CoverageRecommendation } from "@/lib/recruiting-decision-intelligence/types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import { dedupeRecruiterSuggestedActions } from "@/lib/recruiting-decision-intelligence/recommendation-dedupe";
import type {
  RecruiterSuggestedAction,
  VariantPerformanceRow,
} from "@/lib/recruiting-decision-intelligence/types";

function manualAction(
  partial: Omit<RecruiterSuggestedAction, "manualOnly">,
): RecruiterSuggestedAction {
  return { ...partial, manualOnly: true };
}

export function buildRecruiterSuggestedActions(input: {
  coverage: CoverageRecommendation[];
  escalations: RecruiterEscalationQueueItem[];
  variantPerformance: VariantPerformanceRow[];
}): RecruiterSuggestedAction[] {
  const actions: RecruiterSuggestedAction[] = [];

  for (const row of input.coverage) {
    if (row.recommendedExpansionCities.length > 1) {
      actions.push(
        manualAction({
          id: `expand-${row.jobId}`,
          type: "expand-radius",
          title: `Expand city radius (${row.recommendedExpansionRadiusMiles} mi)`,
          reason: row.summaryBullets[0] ?? `Expand from ${row.city} into adjacent metros.`,
          impactEstimate: "+1–4 applicants per adjacent market",
          urgency: row.staffingRiskScore >= 120 ? "critical" : "high",
          jobId: row.jobId,
          city: row.city,
          state: row.state,
        }),
      );
      actions.push(
        manualAction({
          id: `clone-metro-${row.jobId}`,
          type: "clone-metro",
          title: `Clone into nearby metro (${row.recommendedExpansionCities.slice(1, 3).join(", ")})`,
          reason: `Metro expansion candidates: ${row.recommendedExpansionCities.join(", ")}.`,
          impactEstimate: "Adds reviewable variants without auto-publish",
          urgency: "medium",
          jobId: row.jobId,
          city: row.city,
          state: row.state,
        }),
      );
    }

    if (row.jobAgeDays !== null && row.jobAgeDays >= 21 && row.daysWithoutHire !== null) {
      actions.push(
        manualAction({
          id: `pay-${row.jobId}`,
          type: "increase-pay",
          title: "Increase pay range recommendation",
          reason: `Job aging ${row.jobAgeDays}d with no recent hires (${row.daysWithoutHire}d since last hire).`,
          impactEstimate: "+15–25% applicant velocity (manual review)",
          urgency: row.jobAgeDays >= 30 ? "critical" : "high",
          jobId: row.jobId,
          city: row.city,
          state: row.state,
        }),
      );
    }

    if (row.nearbyActiveReps25Mi === 0) {
      actions.push(
        manualAction({
          id: `route-${row.jobId}`,
          type: "route-coverage",
          title: "Route/travel coverage recommendation",
          reason: "No active reps within 25 miles — review route assignment coverage.",
          impactEstimate: "Improves field coverage planning",
          urgency: "high",
          jobId: row.jobId,
          city: row.city,
          state: row.state,
        }),
      );
    }

    const bestVariant = input.variantPerformance
      .filter((variant) => variant.sourceJobId === row.jobId)
      .sort((a, b) => b.applicants - a.applicants)[0];
    if (bestVariant && row.pendingVariantsNearby > 0) {
      actions.push(
        manualAction({
          id: `repost-variant-${bestVariant.draftId}`,
          type: "repost",
          title: `Repost recommendation (variant #${bestVariant.variantIndex + 1})`,
          reason:
            bestVariant.marker === "best"
              ? `Best-performing nearby variant in ${bestVariant.cityTarget} (${bestVariant.applicants} applicants).`
              : `Pending variants available — review before repost.`,
          impactEstimate: "Manual repost only — recruiter approval required",
          urgency: "medium",
          jobId: row.jobId,
          city: row.city,
          state: row.state,
          relatedVariantDraftId: bestVariant.draftId,
        }),
      );
    }

    if (row.territorySaturationScore >= 4) {
      actions.push(
        manualAction({
          id: `merge-${row.jobId}`,
          type: "merge-cities",
          title: "Merge nearby low-performing cities",
          reason: `Territory saturation ${row.territorySaturationScore} open jobs per active rep in ${row.state}.`,
          impactEstimate: "Consolidates recruiting focus (manual decision)",
          urgency: "medium",
          jobId: row.jobId,
          city: row.city,
          state: row.state,
        }),
      );
    }
  }

  for (const escalation of input.escalations) {
    if (escalation.status !== "new" && escalation.status !== "in_review") continue;
    actions.push(
      manualAction({
        id: `escalation-${escalation.id}`,
        type: "escalate-priority",
        title: "Escalate recruiting priority",
        reason: `${escalation.dmName}: ${escalation.alertReason} — ${escalation.recommendedAction}`,
        impactEstimate: "Recruiter queue item requires manual resolution",
        urgency: escalation.priority ?? "high",
        jobId: escalation.relatedJobId,
        city: escalation.city,
        state: escalation.state,
        relatedEscalationId: escalation.id,
      }),
    );
  }

  for (const variant of input.variantPerformance) {
    if (variant.marker !== "aging") continue;
    actions.push(
      manualAction({
        id: `aging-variant-${variant.draftId}`,
        type: "close-stale-duplicate",
        title: "Review aging variant",
        reason: variant.warning ?? "Variant pending too long.",
        impactEstimate: "Archive or approve manually — no auto-close",
        urgency: "medium",
        jobId: variant.sourceJobId,
        city: variant.cityTarget,
        state: variant.state,
        relatedVariantDraftId: variant.draftId,
      }),
    );
  }

  return dedupeRecruiterSuggestedActions(actions);
}
