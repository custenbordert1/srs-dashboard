import type { ExecutiveForecastRecommendation } from "@/lib/executive-recruiting-forecast";
import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";

const LEGACY_UNSTABLE_KEY = /^p44-rec-\d+$/;

export type StableRecommendationKeyInput = {
  kind: string;
  owner?: string | null;
  territoryLabel?: string | null;
  title?: string;
};

/** Slug for stable key segments — lowercase alphanumeric with hyphens. */
export function slugPart(value: string | null | undefined, fallback = "unknown"): string {
  const raw = (value ?? fallback).trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function isLegacyUnstableForecastKey(key: string): boolean {
  return LEGACY_UNSTABLE_KEY.test(key);
}

/**
 * Deterministic business key for P44 recommendations — independent of array order
 * and ephemeral p44-rec-N ids.
 */
export function buildStableRecommendationKey(input: StableRecommendationKeyInput): string {
  const owner = slugPart(input.owner);
  const territory = slugPart(input.territoryLabel);
  const titleSlug = slugPart(input.title, "untitled");

  switch (input.kind) {
    case "escalate-dm-territory":
      return `p44:territory-escalation:${owner}:${territory}`;
    case "refresh-job-ads":
      return `p44:job-refresh:${territory}:${owner}`;
    case "increase-pay":
      return "p44:pay-review:global";
    case "move-recruiter-focus":
      return `p44:recruiter-rebalance:${owner}:overloaded`;
    case "prioritize-candidates":
      return `p44:candidate-shift:${owner}:underused`;
    case "automation":
      return `p44:dm-automation:${owner}`;
    case "pipeline-bottleneck":
      return `p51:pipeline-bottleneck:${territory}:${titleSlug}`;
    default:
      return `p44:generic:${slugPart(input.kind)}:${owner}:${titleSlug}`;
  }
}

export function buildStableRecommendationKeyFromRecommendation(
  rec: ExecutiveForecastRecommendation,
): string {
  return buildStableRecommendationKey({
    kind: rec.kind,
    owner: rec.owner,
    territoryLabel: rec.territoryLabel,
    title: rec.title,
  });
}

export function resolveActionForecastKey(action: ExecutiveTrackedAction): string {
  if (!isLegacyUnstableForecastKey(action.sourceForecastKey)) {
    return action.sourceForecastKey;
  }
  return buildStableRecommendationKey({
    kind: action.recommendationKind ?? "unknown",
    owner: action.owner,
    territoryLabel: action.territoryLabel,
    title: action.title,
  });
}
