import type { AutonomousDecision, DecisionSimulationResult } from "@/lib/autonomous-decision-engine/types";
import { buildSimulationImpact } from "@/lib/autonomous-decision-engine/decision-explanations";

const PREVIEW_SAFEGUARDS = [
  "No workflow state changes",
  "No candidate record mutations",
  "No email or SMS delivery",
  "No Dropbox Sign calls",
  "No automation execution",
];

export function simulateDecisionPreview(
  decision: AutonomousDecision,
): DecisionSimulationResult {
  const wouldExecute: string[] = [];
  const wouldNotExecute: string[] = [...PREVIEW_SAFEGUARDS];

  if (decision.blocked) {
    wouldNotExecute.unshift(`Blocked by: ${decision.blockedBy.join("; ") || "unresolved dependencies"}`);
    wouldExecute.push(`Log advisory: "${decision.decision}" (preview only)`);
  } else if (decision.humanApprovalRequired) {
    wouldExecute.push("Queue decision for human approval review");
    wouldExecute.push(`Simulate downstream effect: ${decision.expectedOutcome}`);
    wouldNotExecute.push("Auto-execution without recruiter sign-off");
  } else if (decision.automationReady) {
    wouldExecute.push(`Simulate ${decision.requiredEngine} automation: ${decision.decision}`);
    wouldExecute.push(decision.expectedOutcome);
  } else {
    wouldExecute.push(`Recommend action to ${decision.requiredEngine}: ${decision.decision}`);
  }

  return {
    decisionId: decision.decisionId,
    decision: decision.decision,
    simulated: true,
    previewOnly: true,
    wouldExecute,
    wouldNotExecute,
    expectedOutcome: decision.expectedOutcome,
    estimatedRecruiterTimeSavedMinutes: decision.estimatedRecruiterTimeSavedMinutes,
    sideEffects: PREVIEW_SAFEGUARDS,
    estimatedImpact: buildSimulationImpact(decision),
    auditNote: "P76 preview simulation — no production actions performed.",
  };
}

export function simulateDecisionById(
  decisions: AutonomousDecision[],
  decisionId: string,
): DecisionSimulationResult | null {
  const decision = decisions.find((d) => d.decisionId === decisionId);
  if (!decision) return null;
  return simulateDecisionPreview(decision);
}
