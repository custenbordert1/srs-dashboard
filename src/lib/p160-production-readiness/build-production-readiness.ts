import { buildP160AutomationReadiness, buildP160RunnerSnapshot } from "@/lib/p160-production-readiness/build-automation-readiness";
import { buildP160DeploymentChecklist } from "@/lib/p160-production-readiness/build-deployment-checklist";
import { buildP160Infrastructure } from "@/lib/p160-production-readiness/build-infrastructure";
import { buildP160Integrations } from "@/lib/p160-production-readiness/build-integrations";
import {
  buildP160OverallScore,
  buildP160Recommendation,
  buildP160RiskAssessment,
} from "@/lib/p160-production-readiness/build-risk-and-recommendation";
import { buildP160SafetyChecklist } from "@/lib/p160-production-readiness/build-safety-checklist";
import { checklistScore } from "@/lib/p160-production-readiness/scoring";
import type { P160ProductionReadinessReport } from "@/lib/p160-production-readiness/types";
import { P160_SOURCE_PHASE } from "@/lib/p160-production-readiness/types";

export async function buildP160ProductionReadiness(): Promise<P160ProductionReadinessReport> {
  const generatedAt = new Date().toISOString();

  const [infrastructure, integrations, automation, safety, deployment, runner] =
    await Promise.all([
      buildP160Infrastructure(),
      buildP160Integrations(),
      buildP160AutomationReadiness(),
      Promise.resolve(buildP160SafetyChecklist()),
      buildP160DeploymentChecklist(),
      buildP160RunnerSnapshot(),
    ]);

  const deploymentScore = checklistScore(deployment.items);
  const overallReadinessScore = buildP160OverallScore({
    infrastructure,
    integrations,
    automation,
    safety,
    deploymentScore,
  });

  const risks = buildP160RiskAssessment({
    infrastructure,
    integrations,
    automation,
    safety,
    continuousEnabled: runner.continuousEnabled,
    daemonRunning: runner.daemonRunning,
  });

  const { recommendation, detail } = buildP160Recommendation({
    score: overallReadinessScore,
    risks,
    infrastructure,
    integrations,
    automation,
    continuousEnabled: runner.continuousEnabled,
  });

  return {
    sourcePhase: P160_SOURCE_PHASE,
    generatedAt,
    overallReadinessScore,
    recommendation,
    recommendationDetail: detail,
    infrastructure,
    integrations,
    automation,
    safety,
    deployment,
    risks,
    validation: {
      readOnly: true,
      continuousModeEnabled: runner.continuousEnabled,
      daemonRunning: runner.daemonRunning,
      noLiveActionsPerformed: true,
    },
  };
}
