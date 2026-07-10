import { buildP160SafetyChecklist } from "@/lib/p160-production-readiness/build-safety-checklist";
import type { P160ProductionReadinessReport } from "@/lib/p160-production-readiness/types";
import { P160_SOURCE_PHASE } from "@/lib/p160-production-readiness/types";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";

/** Fast degraded readiness report — runner state only (no P154–P159 probes). */
export async function buildP160FastSnapshot(): Promise<P160ProductionReadinessReport> {
  const generatedAt = new Date().toISOString();
  const runnerState = await loadP1547RunnerState();
  const continuousEnabled = isP154ContinuousEnabled();
  const daemonRunning =
    continuousEnabled &&
    runnerState.continuousEnabled &&
    runnerState.schedulerMode === "continuous" &&
    runnerState.currentStatus !== "stopped" &&
    runnerState.serverStartTime !== null;
  const safety = buildP160SafetyChecklist();

  return {
    sourcePhase: P160_SOURCE_PHASE,
    generatedAt,
    overallReadinessScore: 0,
    recommendation: "not_ready",
    recommendationDetail: "Degraded fast snapshot — full readiness probes timed out.",
    infrastructure: {
      buildStatus: "warning",
      buildDetail: "Full build probe skipped (timeout)",
      nodeVersion: process.version,
      nodeCompatible: true,
      serverCompatibility: "Unknown — degraded snapshot",
      runtimeHealth: "warning",
      environmentVariables: [],
      secretsConfigured: [],
    },
    integrations: {
      overall: "warning",
      items: [
        {
          id: "degraded",
          label: "Integration probe skipped",
          status: "warning",
          detail: "Timeout",
        },
      ],
    },
    automation: {
      overall: "warning",
      phases: [
        {
          phase: "P161",
          label: "Degraded snapshot",
          status: "warning",
          detail: `Runner ${runnerState.currentStatus}; queue ${runnerState.queueRemaining}`,
        },
      ],
    },
    safety,
    deployment: {
      overall: "warning",
      items: [
        {
          id: "degraded",
          step: "Deployment checklist",
          status: "pending",
          detail: "Skipped due to timeout",
        },
      ],
    },
    risks: { critical: [], high: [], medium: [], low: [] },
    validation: {
      readOnly: true,
      continuousModeEnabled: continuousEnabled,
      daemonRunning,
      noLiveActionsPerformed: true,
    },
  };
}
