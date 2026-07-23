import { assessDataQuality } from "@/lib/p228-production-readiness/data-quality";
import { assessDropboxHealth } from "@/lib/p228-production-readiness/dropbox";
import { assessEligibility, isUnassignedRecruiter } from "@/lib/p228-production-readiness/eligibility";
import { assessGeography } from "@/lib/p228-production-readiness/geography";
import { assessDmHealth, assessRecruiterHealth } from "@/lib/p228-production-readiness/health";
import { buildPipelineInventory } from "@/lib/p228-production-readiness/pipeline";
import {
  decideGoNoGo,
  assessRisk,
  recommendScale,
} from "@/lib/p228-production-readiness/risk-and-scale";
import {
  P228_EXECUTION_MODE,
  P228_PHASE,
  P228_SCHEMA_VERSION,
  type P228Assessment,
  type P228AssessmentInput,
  type P228OperationalDashboard,
} from "@/lib/p228-production-readiness/types";
import { isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import { isP223OperationallyActiveWorkflowStage } from "@/lib/p223-recruiter-inbox-restoration";

export function buildP228Assessment(input: P228AssessmentInput): P228Assessment {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const universe = new Set([...input.ingestionIds, ...input.workflowIds]).size;
  const pipeline = buildPipelineInventory(input.allWorkflowStatuses, universe);
  const eligibility = assessEligibility(input.candidates);
  const recruiters = assessRecruiterHealth(input.candidates);
  const districtManagers = assessDmHealth(input.candidates);
  const geography = assessGeography(input.candidates);
  const dropbox = assessDropboxHealth(input.candidates, input.historical);
  const dataQuality = assessDataQuality({
    candidates: input.candidates,
    ingestionIds: input.ingestionIds,
    workflowIds: input.workflowIds,
  });

  const active = input.candidates.filter((c) =>
    isP223OperationallyActiveWorkflowStage(c.workflowStatus),
  );
  const activeN = Math.max(1, active.length);
  const unassignedRecruiterPct =
    active.filter((c) => isUnassignedRecruiter(c.assignedRecruiter)).length / activeN;
  const missingDmPct = active.filter((c) => isUnassignedDm(c.assignedDM)).length / activeN;
  const coverageUnknownPct =
    active.filter((c) => !c.coverageKnown || c.coverageTier === "unknown").length / activeN;

  const risk = assessRisk({
    pipeline,
    eligibility: eligibility.totals,
    dataQuality,
    dropbox,
    historical: input.historical,
    unassignedRecruiterPct,
    missingDmPct,
    coverageUnknownPct,
  });

  const scale = recommendScale({
    eligiblePopulation: eligibility.totals.eligible,
    risk,
    historical: input.historical,
    topBlockers: eligibility.topBlockers,
  });

  const goNoGo = decideGoNoGo({
    risk,
    scale,
    historical: input.historical,
    eligiblePopulation: eligibility.totals.eligible,
  });

  return {
    phase: P228_PHASE,
    schemaVersion: P228_SCHEMA_VERSION,
    executionMode: P228_EXECUTION_MODE,
    generatedAt,
    pipeline,
    eligibility,
    recruiters,
    districtManagers,
    geography,
    dropbox,
    dataQuality,
    risk,
    scale,
    goNoGo,
    safety: {
      candidateWrites: false,
      dropboxSends: false,
      melWrites: false,
      breezyWrites: false,
      workflowChanges: false,
      commits: false,
    },
  };
}

export function buildP228OperationalDashboard(
  assessment: P228Assessment,
  historical: P228AssessmentInput["historical"],
): P228OperationalDashboard {
  return {
    phase: P228_PHASE,
    generatedAt: assessment.generatedAt,
    operationalReadinessScore: assessment.risk.operationalReadinessScore,
    dataQualityScore: assessment.dataQuality.score,
    goDecision: assessment.goNoGo.decision,
    recommendedMaximumBatchSize: assessment.scale.recommendedMaximumBatchSize,
    pipeline: assessment.pipeline,
    eligibilityTotals: assessment.eligibility.totals,
    topBlockers: assessment.eligibility.topBlockers.slice(0, 10),
    recruiterCount: assessment.recruiters.length,
    dmCount: assessment.districtManagers.length,
    dropbox: assessment.dropbox,
    geographyRisks: {
      over60Markets: assessment.geography.marketsOver60.length,
      coverageUnknownMarkets: assessment.geography.coverageUnknown.length,
      zeroEligibleMarkets: assessment.geography.zeroEligible.length,
    },
    historical,
  };
}
