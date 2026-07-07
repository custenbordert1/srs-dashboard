import { loadAutopilotState } from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";
import { buildP1547AutopilotStatus } from "@/lib/p154-continuous-autonomous-recruiting-runner/build-autopilot-status";
import {
  isP154ContinuousEnabled,
  isP154StopOnError,
  getP154MaxPaperworkSendsPerCycle,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import { buildPrioritizedQueueFromCohort } from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import { loadPrioritizationCohort } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { buildAssignmentDashboard } from "@/lib/p158-autonomous-recruiter-assignment/build-assignment-dashboard";
import { isP158AutomaticAssignmentsEnabled } from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import { buildAssignmentSimulation } from "@/lib/p158-assignment-simulation/build-assignment-simulation";
import { buildPostAssignmentOutcomeDiagnosis } from "@/lib/p158-post-assignment-outcome-diagnosis/build-outcome-diagnosis";
import { buildTransitionReport } from "@/lib/p158-post-assignment-workflow-transition";
import { isP158WorkflowTransitionEnabled } from "@/lib/p158-post-assignment-workflow-transition/transition-config";
import { buildP159OperationsControlCenter } from "@/lib/p159-operations-control-center/build-operations-control-center";
import { buildP155OperationsDashboard } from "@/lib/p155-autopilot-operations-dashboard/build-operations-dashboard";
import type {
  P160AutomationPhase,
  P160AutomationReadinessSection,
  P160ReadinessLevel,
} from "@/lib/p160-production-readiness/types";
import { aggregateLevel } from "@/lib/p160-production-readiness/scoring";

async function probeP154(): Promise<P160AutomationPhase> {
  const [health, runner, autopilot] = await Promise.all([
    verifyAutopilotSystemHealth(),
    loadP1547RunnerState(),
    loadAutopilotState(),
  ]);
  const continuous = isP154ContinuousEnabled();
  const autopilotEnv = isP154ControlledProductionAutopilotEnabled();

  let status: P160ReadinessLevel = "ready";
  let detail = "Controlled production autopilot built with health checks, caps, and overlap lock.";

  if (!health.healthy) {
    status = "blocked";
    detail = health.abortReason ?? "System health check failed.";
  } else if (continuous) {
    status = "warning";
    detail = "P154_CONTINUOUS_ENABLED=true — verify daemon monitoring before production.";
  } else if (!autopilotEnv) {
    status = "warning";
    detail =
      "P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED not set — enable on server for live capped cycles.";
  }

  return {
    phase: "P154",
    label: "P154 Controlled Production Autopilot",
    status,
    detail,
    components: [
      `Health: ${health.overallStatus}`,
      `Runner: ${runner.schedulerMode}`,
      `Autopilot state: ${autopilot.autopilotStatus}`,
      `Send cap: ${getP154MaxPaperworkSendsPerCycle()}/cycle`,
      `Stop on error: ${isP154StopOnError()}`,
    ],
  };
}

async function probeP155(): Promise<P160AutomationPhase> {
  try {
    const built = await buildP155OperationsDashboard();
    const status: P160ReadinessLevel =
      built.dashboard.status.runnerStatus === "error" ? "blocked" : "ready";
    return {
      phase: "P155",
      label: "P155 Operations Dashboard",
      status,
      detail: `Dashboard operational — runner ${built.dashboard.status.runnerStatus}, ${built.dashboard.today.paperworkSent} sends today.`,
      components: ["GET /api/recruiting/autopilot/status", "POST /api/recruiting/autopilot/control"],
    };
  } catch (error) {
    return {
      phase: "P155",
      label: "P155 Operations Dashboard",
      status: "blocked",
      detail: error instanceof Error ? error.message : "P155 dashboard build failed.",
    };
  }
}

async function probeP156(): Promise<P160AutomationPhase> {
  try {
    const cohort = await loadPrioritizationCohort();
    const queue = await buildPrioritizedQueueFromCohort(cohort, {
      recruiter: null,
      dm: null,
      state: null,
      project: null,
      priorityMin: null,
      priorityMax: null,
      stage: null,
    });
    return {
      phase: "P156",
      label: "P156 Candidate Prioritization",
      status: queue.candidates.length > 0 ? "ready" : "warning",
      detail: `Prioritization engine scored ${queue.candidates.length} candidates.`,
      components: ["GET /api/recruiting/prioritized-queue", "/executive/recruiting-priorities"],
    };
  } catch (error) {
    return {
      phase: "P156",
      label: "P156 Candidate Prioritization",
      status: "blocked",
      detail: error instanceof Error ? error.message : "P156 queue build failed.",
    };
  }
}

async function probeP157(): Promise<P160AutomationPhase> {
  try {
    const cohort = await loadDecisionCohort();
    const dashboard = await buildDecisionDashboardFromCohort(cohort);
    return {
      phase: "P157",
      label: "P157 Recruiter Decision Engine",
      status: dashboard.decisions.length > 0 ? "ready" : "warning",
      detail: `${dashboard.decisions.length} decisions generated; ${dashboard.sections.needsPaperwork.length} Send Paperwork recommendations.`,
      components: ["GET /api/recruiting/recommended-actions", "/executive/recruiting-decisions"],
    };
  } catch (error) {
    return {
      phase: "P157",
      label: "P157 Recruiter Decision Engine",
      status: "blocked",
      detail: error instanceof Error ? error.message : "P157 dashboard build failed.",
    };
  }
}

async function probeP158(): Promise<P160AutomationPhase> {
  const components: string[] = [];
  const levels: P160ReadinessLevel[] = [];

  try {
    const dashboard = await buildAssignmentDashboard();
    levels.push(dashboard.summary.assignmentQueue > 0 ? "ready" : "warning");
    components.push(`P158 assignment queue: ${dashboard.summary.assignmentQueue} items`);
  } catch {
    levels.push("blocked");
    components.push("P158 assignment dashboard failed");
  }

  try {
    const sim = await buildAssignmentSimulation();
    levels.push(sim.summary.candidatesAssignedInSimulation > 0 ? "ready" : "warning");
    components.push(`P158.1 simulation: ${sim.summary.candidatesAssignedInSimulation} would assign`);
  } catch {
    levels.push("warning");
    components.push("P158.1 simulation unavailable");
  }

  try {
    const diagnosis = await buildPostAssignmentOutcomeDiagnosis();
    levels.push(diagnosis.summary.candidatesDiagnosed > 0 ? "ready" : "warning");
    components.push(`P158.2 diagnosis: ${diagnosis.summary.candidatesDiagnosed} candidates`);
  } catch {
    levels.push("warning");
    components.push("P158.2 diagnosis unavailable");
  }

  try {
    const transition = await buildTransitionReport();
    levels.push(transition.summary.transitionEligible >= 0 ? "ready" : "warning");
    components.push(`P158.3 transition: ${transition.summary.transitionEligible} eligible`);
  } catch {
    levels.push("warning");
    components.push("P158.3 transition report unavailable");
  }

  const assignmentsEnabled = isP158AutomaticAssignmentsEnabled();
  const transitionEnabled = isP158WorkflowTransitionEnabled();
  if (assignmentsEnabled || transitionEnabled) {
    levels.push("warning");
    components.push(
      `Live flags: assignments=${assignmentsEnabled}, transition=${transitionEnabled}`,
    );
  }

  return {
    phase: "P158",
    label: "P158 Recruiter Assignment (+ P158.1–P158.3)",
    status: aggregateLevel(levels),
    detail:
      assignmentsEnabled || transitionEnabled
        ? "P158 live flags enabled — verify operator controls before server deployment."
        : "Assignment, simulation, diagnosis, and transition modules operational (read-only).",
    components,
  };
}

async function probeP159(): Promise<P160AutomationPhase> {
  try {
    const built = await buildP159OperationsControlCenter();
    const d = built.dashboard;
    let status: P160ReadinessLevel = "ready";
    if (d.runner.systemMode === "blocked") status = "blocked";
    else if (d.runner.systemMode === "degraded" || d.runner.systemMode === "paused") {
      status = "warning";
    }
    return {
      phase: "P159",
      label: "P159 Operations Control Center",
      status,
      detail: `Control center live — mode ${d.runner.systemMode}, ${d.today.paperworkSent} sends today, recommendation: ${d.recommendation}.`,
      components: [
        "GET /api/recruiting/operations-control-center",
        "POST /api/recruiting/operations-control-center/control",
        "/executive/operations-control-center",
      ],
    };
  } catch (error) {
    return {
      phase: "P159",
      label: "P159 Operations Control Center",
      status: "blocked",
      detail: error instanceof Error ? error.message : "P159 control center build failed.",
    };
  }
}

export async function buildP160AutomationReadiness(): Promise<P160AutomationReadinessSection> {
  const phases = await Promise.all([
    probeP154(),
    probeP155(),
    probeP156(),
    probeP157(),
    probeP158(),
    probeP159(),
  ]);
  return {
    overall: aggregateLevel(phases.map((p) => p.status)),
    phases,
  };
}

export async function buildP160RunnerSnapshot(): Promise<{
  continuousEnabled: boolean;
  daemonRunning: boolean;
}> {
  const [status, runner] = await Promise.all([buildP1547AutopilotStatus(), loadP1547RunnerState()]);
  const continuousEnabled = isP154ContinuousEnabled();
  const daemonRunning =
    continuousEnabled &&
    runner.continuousEnabled &&
    runner.schedulerMode === "continuous" &&
    runner.currentStatus !== "stopped" &&
    runner.serverStartTime !== null;
  return { continuousEnabled, daemonRunning };
}
