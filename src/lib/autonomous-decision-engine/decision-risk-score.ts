import type { DecisionRisk } from "@/lib/autonomous-decision-engine/types";
import type { OrchestratorRiskLevel } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { OperationsSeverity } from "@/lib/autonomous-operations-center/types";
import { riskToNumeric } from "@/lib/autonomous-decision-engine/decision-priority";

export function riskFromOrchestration(riskLevel: OrchestratorRiskLevel, blocked: boolean): DecisionRisk {
  if (blocked) return riskLevel === "critical" ? "critical" : "high";
  if (riskLevel === "critical") return "critical";
  if (riskLevel === "high") return "high";
  if (riskLevel === "medium") return "medium";
  return "low";
}

export function riskFromIssueSeverity(severity: OperationsSeverity): DecisionRisk {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

export function riskFromLikelihood(likelihood: "low" | "medium" | "high"): DecisionRisk {
  if (likelihood === "high") return "high";
  if (likelihood === "medium") return "medium";
  return "low";
}

export function averageRiskScore(risks: DecisionRisk[]): number | null {
  if (risks.length === 0) return null;
  const total = risks.reduce((sum, risk) => sum + riskToNumeric(risk), 0);
  return Math.round((total / risks.length) * 25);
}
