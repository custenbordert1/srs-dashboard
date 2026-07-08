import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";
import type { P1682ActionPlanItem } from "@/lib/p168.2-executive-readiness-advisor/types";
import { P1682_REQUIRED_READINESS_SCORE } from "@/lib/p168.2-executive-readiness-advisor/calculate-readiness-progress";

const ACTION_ORDER: Array<{ id: string; importance: P1682ActionPlanItem["importance"]; impact: number }> = [
  { id: "live_env_gate", importance: "critical", impact: 18 },
  { id: "readiness_threshold", importance: "critical", impact: 16 },
  { id: "deferred_backlog", importance: "high", impact: 12 },
  { id: "processing_lock", importance: "critical", impact: 15 },
  { id: "daemon_stopped", importance: "critical", impact: 14 },
  { id: "continuous_disabled", importance: "critical", impact: 14 },
  { id: "dropbox_healthy", importance: "high", impact: 12 },
  { id: "runner_healthy", importance: "high", impact: 10 },
  { id: "wait_window", importance: "medium", impact: 8 },
  { id: "last_cycle_success", importance: "high", impact: 10 },
  { id: "queue_ready", importance: "high", impact: 11 },
  { id: "duplicate_protection", importance: "medium", impact: 6 },
];

function targetForGate(id: string): string {
  const targets: Record<string, string> = {
    live_env_gate: "P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED=true",
    readiness_threshold: `Score > ${P1682_REQUIRED_READINESS_SCORE}`,
    deferred_backlog: "Within 2× monitor budget",
    processing_lock: "No active lock",
    daemon_stopped: "Daemon not running",
    continuous_disabled: "Continuous mode off",
    dropbox_healthy: "Within API budget, no throttling",
    runner_healthy: "Idle and healthy",
    wait_window: "≥ 2 minutes since last cycle",
    last_cycle_success: "0 errors on last cycle",
    queue_ready: "Eligible candidates available",
    duplicate_protection: "Enabled",
  };
  return targets[id] ?? "Satisfied";
}

function currentForGate(
  id: string,
  view: P1681ExecutiveDecisionCenterView,
): string {
  const readiness = view.systemStatus.productionReadinessScore;
  switch (id) {
    case "live_env_gate":
      return view.blocking.checklist.find((c) => c.id === "live_env_gate")?.pass
        ? "Enabled"
        : "Not enabled";
    case "readiness_threshold":
      return readiness == null ? "Unavailable" : String(readiness);
    case "deferred_backlog":
      return view.blocking.checklist.find((c) => c.id === "deferred_backlog")?.detail ?? "—";
    case "processing_lock":
      return view.safety.continuousModeEnabled ? "—" : view.blocking.checklist.find((c) => c.id === "processing_lock")?.pass ? "Clear" : "Held";
    case "daemon_stopped":
      return view.systemStatus.daemonActive ? "Running" : "Stopped";
    case "continuous_disabled":
      return view.systemStatus.continuousMode ? "Enabled" : "Disabled";
    case "dropbox_healthy":
      return view.blocking.checklist.find((c) => c.id === "dropbox_healthy")?.pass ? "Healthy" : "Degraded";
    case "runner_healthy":
      return view.systemStatus.runnerStatus;
    case "wait_window":
      return view.blocking.checklist.find((c) => c.id === "wait_window")?.pass ? "Satisfied" : "Waiting";
    case "last_cycle_success":
      return view.blocking.checklist.find((c) => c.id === "last_cycle_success")?.pass ? "Success" : "Errors";
    case "queue_ready":
      return view.recommendation.expectedSends > 0 ? `${view.recommendation.expectedSends} projected` : "Empty";
    case "duplicate_protection":
      return "Enabled";
    default:
      return "—";
  }
}

export function buildActionPlan(view: P1681ExecutiveDecisionCenterView): P1682ActionPlanItem[] {
  const checklist = view.blocking.checklist.filter((c) => c.id !== "all_gates");
  const byId = new Map(checklist.map((c) => [c.id, c]));

  return ACTION_ORDER.filter((a) => byId.has(a.id)).map((meta) => {
    const gate = byId.get(meta.id)!;
    return {
      id: meta.id,
      label: gate.label,
      complete: gate.pass,
      currentValue: gate.pass ? "Satisfied" : currentForGate(meta.id, view),
      targetValue: targetForGate(meta.id),
      importance: meta.importance,
      estimatedImpact: gate.pass ? 0 : meta.impact,
    };
  });
}

export function buildRemainingBlockers(view: P1681ExecutiveDecisionCenterView): string[] {
  return buildActionPlan(view)
    .filter((a) => !a.complete)
    .sort((a, b) => b.estimatedImpact - a.estimatedImpact)
    .map((a) => a.label);
}

export function buildWhyWaiting(view: P1681ExecutiveDecisionCenterView): string {
  if (view.recommendation.action === "RUN_NEXT_BATCH") {
    return "All gates are satisfied — the platform is ready for executive approval of the next capped batch.";
  }
  if (view.recommendation.action === "HOLD_INVESTIGATION") {
    return view.recommendation.reason;
  }
  if (view.recommendation.action === "NO_ACTION_REQUIRED") {
    return "No eligible candidates are in the pipeline — a production batch would not send paperwork.";
  }
  const blockers = buildWhatMustChange(view);
  if (blockers.length === 0) {
    return view.recommendation.reason;
  }
  return `Waiting because ${blockers.slice(0, 3).join("; ")}${blockers.length > 3 ? `; +${blockers.length - 3} more` : ""}.`;
}

export function buildWhatMustChange(view: P1681ExecutiveDecisionCenterView): string[] {
  return buildActionPlan(view)
    .filter((a) => !a.complete)
    .map((a) => `${a.label}: ${a.currentValue} → ${a.targetValue}`);
}
