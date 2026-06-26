import type { CandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { OrchestratorDashboardSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { OperationsDashboardSnapshot } from "@/lib/autonomous-operations-center/types";
import type { OperationsEngineId } from "@/lib/autonomous-operations-center/types";
import type { AutonomousDecision, DecisionCategory } from "@/lib/autonomous-decision-engine/types";
import { confidenceFromIssue, confidenceFromOrchestration, confidenceFromPlatformImprovement } from "@/lib/autonomous-decision-engine/decision-confidence";
import { buildExecutiveExplanation } from "@/lib/autonomous-decision-engine/decision-explanations";
import { derivePriority } from "@/lib/autonomous-decision-engine/decision-priority";
import { riskFromIssueSeverity, riskFromLikelihood, riskFromOrchestration } from "@/lib/autonomous-decision-engine/decision-risk-score";

const ENGINE_LABELS: Record<OperationsEngineId, string> = {
  recruiting: "Recruiting Intelligence Engine",
  paperwork: "Paperwork Engine",
  execution: "Paperwork Execution Engine",
  communication: "Communication Engine",
  onboarding: "Onboarding Engine",
  executive: "Executive Engine",
  orchestrator: "Recruiting Orchestrator",
  operations: "Operations Center",
};

function engineToCategory(engine: OperationsEngineId): DecisionCategory {
  switch (engine) {
    case "recruiting":
      return "recruiting";
    case "paperwork":
      return "paperwork";
    case "execution":
      return "automation";
    case "communication":
      return "communication";
    case "onboarding":
      return "onboarding";
    case "executive":
      return "executive";
    case "orchestrator":
      return "automation";
    case "operations":
      return "operations";
    default:
      return "operations";
  }
}

function orchestratorEngineLabel(engine: CandidateOrchestrationSnapshot["responsibleEngine"]): string {
  const labels: Record<CandidateOrchestrationSnapshot["responsibleEngine"], string> = {
    recruiting_intelligence: "Recruiting Intelligence Engine",
    paperwork_intelligence: "Paperwork Engine",
    paperwork_execution: "Paperwork Execution Engine",
    communication: "Communication Engine",
    onboarding: "Onboarding Engine",
    executive: "Executive Engine",
  };
  return labels[engine];
}

function orchestratorEngineCategory(engine: CandidateOrchestrationSnapshot["responsibleEngine"]): DecisionCategory {
  switch (engine) {
    case "recruiting_intelligence":
      return "recruiting";
    case "paperwork_intelligence":
      return "paperwork";
    case "paperwork_execution":
      return "automation";
    case "communication":
      return "communication";
    case "onboarding":
      return "onboarding";
    case "executive":
      return "executive";
    default:
      return "candidate";
  }
}

function estimateTimeSaved(input: {
  automationReady: boolean;
  category: DecisionCategory;
  affectedCount: number;
}): number {
  const base = input.automationReady ? 25 : 12;
  const multiplier = input.category === "executive" || input.category === "operations" ? 3 : 1;
  return Math.min(180, base * multiplier * Math.max(1, Math.min(input.affectedCount, 5)));
}

function decisionFromOrchestration(orch: CandidateOrchestrationSnapshot, index: number): AutonomousDecision {
  const blocked = orch.blockers.length > 0 || !orch.automationEligible;
  const confidence = confidenceFromOrchestration({
    automationEligible: orch.automationEligible,
    riskLevel: orch.riskLevel,
    blockerCount: orch.blockers.length,
  });
  const risk = riskFromOrchestration(orch.riskLevel, blocked);
  const category = orchestratorEngineCategory(orch.responsibleEngine);
  const priority = derivePriority({
    severity: orch.riskLevel,
    automationReady: orch.automationEligible,
    blocked,
    confidence,
  });

  const partial: AutonomousDecision = {
    decisionId: `orch-${orch.candidateId}-${index}`,
    category,
    decision: orch.nextAction,
    reason: blocked
      ? `Blocked: ${orch.blockers.join("; ") || orch.automationEligibilityReason}`
      : orch.automationEligibilityReason || `Candidate at ${orch.workflowStage} stage`,
    confidence,
    priority,
    risk,
    requiredEngine: orchestratorEngineLabel(orch.responsibleEngine),
    dependencies: orch.workflowStage === "paperwork" ? ["Paperwork eligibility verified"] : [],
    blockedBy: orch.blockers,
    expectedOutcome: blocked
      ? "Resolve blockers to unblock workflow progression"
      : `Advance ${orch.candidateName} toward ${orch.workflowStage === "ready_for_work" ? "ready for work" : "next workflow stage"}`,
    estimatedRecruiterTimeSavedMinutes: estimateTimeSaved({
      automationReady: orch.automationEligible,
      category,
      affectedCount: 1,
    }),
    executiveExplanation: "",
    affectedCandidateIds: [orch.candidateId],
    affectedCandidateNames: [orch.candidateName],
    humanApprovalRequired: orch.workflowStage === "recruiter_approval" || category === "executive",
    automationReady: orch.automationEligible && !blocked,
    blocked,
  };

  return { ...partial, executiveExplanation: buildExecutiveExplanation(partial) };
}

function decisionFromIssue(
  issue: OperationsDashboardSnapshot["openRisks"][number],
  index: number,
): AutonomousDecision {
  const category = engineToCategory(issue.responsibleEngine);
  const blocked = issue.issueType === "paperwork_blocked" || issue.issueType === "workflow_dead_end";
  const confidence = confidenceFromIssue({ severity: issue.severity, issueConfidence: issue.confidence });
  const risk = riskFromIssueSeverity(issue.severity);
  const priority = derivePriority({
    severity: issue.severity,
    automationReady: false,
    blocked,
    confidence,
  });

  const partial: AutonomousDecision = {
    decisionId: `ops-${issue.issueId}-${index}`,
    category,
    decision: issue.recommendedAction,
    reason: issue.reason,
    confidence,
    priority,
    risk,
    requiredEngine: ENGINE_LABELS[issue.responsibleEngine],
    dependencies: issue.affectedCandidateIds.length > 0 ? ["Candidate workflow data current"] : ["Platform monitoring data"],
    blockedBy: blocked ? [issue.reason] : [],
    expectedOutcome: `Resolve ${issue.issueType.replace(/_/g, " ")} for affected candidates`,
    estimatedRecruiterTimeSavedMinutes: estimateTimeSaved({
      automationReady: false,
      category,
      affectedCount: issue.affectedCandidateIds.length,
    }),
    executiveExplanation: "",
    affectedCandidateIds: issue.affectedCandidateIds,
    affectedCandidateNames: issue.affectedCandidateNames,
    humanApprovalRequired: issue.severity === "critical" || category === "executive",
    automationReady: false,
    blocked,
  };

  return { ...partial, executiveExplanation: buildExecutiveExplanation(partial) };
}

function decisionFromPredictiveRisk(
  risk: OperationsDashboardSnapshot["predictiveRisks"][number],
  index: number,
): AutonomousDecision {
  const category = engineToCategory(risk.engine);
  const confidence = confidenceFromPlatformImprovement(risk.likelihood === "high" ? 82 : risk.likelihood === "medium" ? 68 : 58);
  const decisionRisk = riskFromLikelihood(risk.likelihood);
  const priority = derivePriority({
    severity: risk.likelihood === "high" ? "high" : risk.likelihood === "medium" ? "medium" : "low",
    automationReady: false,
    blocked: false,
    confidence,
  });

  const partial: AutonomousDecision = {
    decisionId: `pred-${risk.id}-${index}`,
    category,
    decision: risk.recommendation,
    reason: `${risk.label}: ${risk.impact}`,
    confidence,
    priority,
    risk: decisionRisk,
    requiredEngine: ENGINE_LABELS[risk.engine],
    dependencies: ["Predictive monitoring signals"],
    blockedBy: [],
    expectedOutcome: `Prevent ${risk.label.toLowerCase()} before it impacts hiring velocity`,
    estimatedRecruiterTimeSavedMinutes: estimateTimeSaved({ automationReady: false, category, affectedCount: 2 }),
    executiveExplanation: "",
    affectedCandidateIds: [],
    affectedCandidateNames: [],
    humanApprovalRequired: risk.likelihood === "high",
    automationReady: false,
    blocked: false,
  };

  return { ...partial, executiveExplanation: buildExecutiveExplanation(partial) };
}

function decisionFromImprovement(improvement: string, index: number): AutonomousDecision {
  const confidence = confidenceFromPlatformImprovement(78);
  const partial: AutonomousDecision = {
    decisionId: `exec-${index}`,
    category: "executive",
    decision: improvement,
    reason: "Derived from platform readiness and operations monitoring",
    confidence,
    priority: derivePriority({ severity: "medium", automationReady: false, blocked: false, confidence }),
    risk: "medium",
    requiredEngine: "Executive Engine",
    dependencies: ["Cross-engine health snapshot"],
    blockedBy: [],
    expectedOutcome: "Improve overall automation readiness and reduce operational risk",
    estimatedRecruiterTimeSavedMinutes: 45,
    executiveExplanation: "",
    affectedCandidateIds: [],
    affectedCandidateNames: [],
    humanApprovalRequired: true,
    automationReady: false,
    blocked: false,
  };

  return { ...partial, executiveExplanation: buildExecutiveExplanation(partial) };
}

export function generateAutonomousDecisions(input: {
  orchestrations: CandidateOrchestrationSnapshot[];
  operations: OperationsDashboardSnapshot;
  orchestrator: OrchestratorDashboardSnapshot;
}): AutonomousDecision[] {
  const decisions: AutonomousDecision[] = [];

  const actionableOrchestrations = input.orchestrations.filter(
    (o) => o.workflowStage !== "workflow_complete" && o.nextAction.trim().length > 0,
  );

  for (const [index, orch] of actionableOrchestrations.slice(0, 40).entries()) {
    decisions.push(decisionFromOrchestration(orch, index));
  }

  for (const [index, issue] of input.operations.criticalAlerts.slice(0, 30).entries()) {
    decisions.push(decisionFromIssue(issue, index));
  }

  for (const [index, risk] of input.operations.predictiveRisks.entries()) {
    decisions.push(decisionFromPredictiveRisk(risk, index));
  }

  for (const [index, improvement] of input.orchestrator.readinessScore.improvements.entries()) {
    decisions.push(decisionFromImprovement(improvement, index));
  }

  for (const [index, improvement] of input.operations.platformHealth.improvements.slice(0, 5).entries()) {
    decisions.push(decisionFromImprovement(improvement, 100 + index));
  }

  const seen = new Set<string>();
  return decisions.filter((d) => {
    const key = `${d.decision}|${d.affectedCandidateIds.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
