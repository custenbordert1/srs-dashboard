import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { assertRecommendationsOnly } from "@/lib/recruiting-decision-intelligence/automation-guard";
import { buildCoverageRecommendations } from "@/lib/recruiting-decision-intelligence/coverage-recommendation-engine";
import { buildRecruiterSuggestedActions } from "@/lib/recruiting-decision-intelligence/suggested-actions";
import { buildTerritoryIntelligenceSnapshot } from "@/lib/recruiting-decision-intelligence/territory-intelligence";
import type { RecruiterDecisionIntelligenceSnapshot } from "@/lib/recruiting-decision-intelligence/types";
import { buildVariantPerformanceRows } from "@/lib/recruiting-decision-intelligence/variant-performance";
import {
  buildCoverageHealthMetrics,
  buildNeedsAttentionAlerts,
} from "@/lib/recruiting-decision-intelligence/needs-attention-alerts";

export function buildRecruiterDecisionIntelligence(input: {
  territoryLabel: string;
  territoryStates: string[];
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  drafts: JobDraft[];
  escalations: RecruiterEscalationQueueItem[];
  activeReps: ActiveRep[];
  fetchedAt: string;
}): RecruiterDecisionIntelligenceSnapshot {
  const coverageRecommendations = buildCoverageRecommendations({
    jobs: input.jobs,
    candidates: input.candidates,
    drafts: input.drafts,
    escalations: input.escalations,
    activeReps: input.activeReps,
    referenceIso: input.fetchedAt,
  });

  const variantPerformance = buildVariantPerformanceRows(
    input.drafts,
    input.jobs,
    input.candidates,
    input.fetchedAt,
  );

  const territory = buildTerritoryIntelligenceSnapshot({
    territoryLabel: input.territoryLabel,
    territoryStates: input.territoryStates,
    jobs: input.jobs,
    candidates: input.candidates,
    escalations: input.escalations,
    referenceIso: input.fetchedAt,
  });

  const suggestedActions = buildRecruiterSuggestedActions({
    coverage: coverageRecommendations,
    escalations: input.escalations,
    variantPerformance,
  });

  assertRecommendationsOnly(suggestedActions);

  const needsAttentionAlerts = buildNeedsAttentionAlerts({
    jobs: input.jobs,
    candidates: input.candidates,
    coverageRecommendations,
    activeReps: input.activeReps,
    referenceIso: input.fetchedAt,
  });

  const coverageHealth = buildCoverageHealthMetrics({
    jobs: input.jobs,
    activeReps: input.activeReps,
    coverageRecommendations,
  });

  return {
    fetchedAt: input.fetchedAt,
    coverageRecommendations,
    suggestedActions,
    variantPerformance,
    territory,
    recommendedNextActions: suggestedActions.slice(0, 12),
    needsAttentionAlerts,
    coverageHealth,
  };
}
