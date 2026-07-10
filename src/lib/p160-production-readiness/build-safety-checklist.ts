import {
  getP154MaxAssignmentsPerCycle,
  getP154MaxPaperworkSendsPerCycle,
  isP154ContinuousEnabled,
  isP154StopOnError,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { isP147InitialPaperworkAutoSendEnabled } from "@/lib/recruiting/initial-paperwork-execution-engine";
import { isP152ImmediatePaperworkEnabled } from "@/lib/p152-immediate-paperwork-policy/execute-immediate-paperwork-policy";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import type { P160SafetyChecklistSection } from "@/lib/p160-production-readiness/types";
import { aggregateLevel } from "@/lib/p160-production-readiness/scoring";

export function buildP160SafetyChecklist(): P160SafetyChecklistSection {
  const items = [
    {
      id: "duplicate_protection",
      label: "Duplicate protection",
      status: "ready" as const,
      detail: "P152 hard blockers + onboarding duplicate checks active on every send.",
    },
    {
      id: "rollback",
      label: "Rollback procedures",
      status: "ready" as const,
      detail: "P158 assignment rollback + P158.3 transition rollback + autopilot pause documented.",
    },
    {
      id: "audit_logging",
      label: "Audit logging",
      status: "ready" as const,
      detail: "P145 paperwork audit, P151 pipeline audit, workflow audit JSONL, P154.7 runner audit.",
    },
    {
      id: "stop_on_error",
      label: "Stop-on-error",
      status: isP154StopOnError() ? ("ready" as const) : ("warning" as const),
      detail: isP154StopOnError()
        ? "P154_STOP_ON_ERROR active — cycle halts on first failure."
        : "P154_STOP_ON_ERROR=false — failures may continue batch.",
    },
    {
      id: "overlap_lock",
      label: "Overlap lock",
      status: "ready" as const,
      detail: "P154.7 file-based lock with 15-minute stale detection prevents concurrent cycles.",
    },
    {
      id: "caps",
      label: "Per-cycle caps",
      status: "ready" as const,
      detail: `Send cap ${getP154MaxPaperworkSendsPerCycle()}/cycle, assignment cap ${getP154MaxAssignmentsPerCycle()}/cycle.`,
    },
    {
      id: "feature_flags",
      label: "Feature flags (safe defaults)",
      status:
        isP154ContinuousEnabled() || isP147InitialPaperworkAutoSendEnabled()
          ? ("warning" as const)
          : ("ready" as const),
      detail: [
        `P154_CONTINUOUS_ENABLED=${isP154ContinuousEnabled()}`,
        `P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED=${isP154ControlledProductionAutopilotEnabled()}`,
        `P152_IMMEDIATE_PAPERWORK_ENABLED=${isP152ImmediatePaperworkEnabled()}`,
        `P147_INITIAL_PAPERWORK_AUTO_SEND_ENABLED=${isP147InitialPaperworkAutoSendEnabled()}`,
      ].join("; "),
    },
  ];

  return {
    overall: aggregateLevel(items.map((i) => i.status)),
    items,
  };
}
