import type { CandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { OperationalIssue } from "@/lib/autonomous-operations-center/types";
import type { PredictiveRisk } from "@/lib/autonomous-operations-center/types";

export function buildPredictiveRisks(input: {
  orchestrations: CandidateOrchestrationSnapshot[];
  issues: OperationalIssue[];
  queueDepth: number;
  referenceMs: number;
}): PredictiveRisk[] {
  const risks: PredictiveRisk[] = [];

  const likelyBlocked = input.orchestrations.filter(
    (o) => o.riskLevel === "high" || o.riskLevel === "critical" || o.blockers.length > 0,
  );
  if (likelyBlocked.length > 0) {
    risks.push({
      id: "blocked-candidates",
      label: "Candidates likely to become blocked",
      likelihood: likelyBlocked.length > 5 ? "high" : "medium",
      impact: `${likelyBlocked.length} candidates show elevated block risk`,
      recommendation: "Prioritize recruiter review on high-risk candidates",
      engine: "orchestrator",
    });
  }

  if (input.queueDepth > 30) {
    risks.push({
      id: "queue-growth",
      label: "Queues likely to grow",
      likelihood: input.queueDepth > 80 ? "high" : "medium",
      impact: `Current combined queue depth ${input.queueDepth}`,
      recommendation: "Scale preview automation or clear bottlenecks",
      engine: "operations",
    });
  }

  const recruiterLoads = new Map<string, number>();
  for (const o of input.orchestrations) {
    if (o.workflowStage === "recruiter_approval" || o.blockers.length > 0) {
      recruiterLoads.set(o.recruiter, (recruiterLoads.get(o.recruiter) ?? 0) + 1);
    }
  }
  const overloaded = [...recruiterLoads.entries()].filter(([, count]) => count >= 5);
  if (overloaded.length > 0) {
    risks.push({
      id: "recruiter-overload",
      label: "Recruiters becoming overloaded",
      likelihood: "high",
      impact: `${overloaded[0][0]} has ${overloaded[0][1]} pending actions`,
      recommendation: "Rebalance recruiter workload or enable automation",
      engine: "recruiting",
    });
  }

  const commOverdue = input.issues.filter((i) => i.issueType === "communication_overdue").length;
  if (commOverdue > 0) {
    risks.push({
      id: "automation-fail",
      label: "Automation likely to fail",
      likelihood: commOverdue > 3 ? "high" : "medium",
      impact: `${commOverdue} overdue communication signals`,
      recommendation: "Send preview reminders before SLA breach",
      engine: "communication",
    });
  }

  const stalled = input.orchestrations.filter((o) => o.workflowStage === "communication" || o.workflowStage === "paperwork");
  if (stalled.length > 10) {
    risks.push({
      id: "workflow-completion",
      label: "Workflow completion risk",
      likelihood: "medium",
      impact: `${stalled.length} candidates in paperwork/communication stages`,
      recommendation: "Focus on signature and onboarding acceleration",
      engine: "paperwork",
    });
  }

  risks.push({
    id: "bottleneck-tomorrow",
    label: "Upcoming bottlenecks",
    likelihood: input.issues.length > 10 ? "high" : "low",
    impact: "Issue volume trending above baseline",
    recommendation: "Review operations center alerts daily",
    engine: "operations",
  });

  return risks.slice(0, 8);
}
