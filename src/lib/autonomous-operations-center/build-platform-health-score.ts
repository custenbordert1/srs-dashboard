import type { AutonomousCandidateCommunicationDashboardSnapshot } from "@/lib/autonomous-candidate-communication-engine/types";
import type { AutonomousPaperworkDashboardSnapshot } from "@/lib/autonomous-paperwork-engine/types";
import type { OrchestratorDashboardSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { OperationalIssue, PlatformHealthScore } from "@/lib/autonomous-operations-center/types";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function buildPlatformHealthScore(input: {
  issues: OperationalIssue[];
  orchestrator: OrchestratorDashboardSnapshot;
  paperwork: AutonomousPaperworkDashboardSnapshot;
  communication: AutonomousCandidateCommunicationDashboardSnapshot;
  workflowTotal: number;
}): PlatformHealthScore {
  const critical = input.issues.filter((i) => i.severity === "critical").length;
  const high = input.issues.filter((i) => i.severity === "high").length;
  const total = input.workflowTotal || 1;

  const automationScore = clamp(input.orchestrator.readinessScore.overall);
  const workflowScore = clamp(100 - ((critical * 15 + high * 8) / total) * 100);
  const performanceScore = clamp(100 - critical * 10);
  const dataScore = clamp(100 - (input.issues.filter((i) => i.issueType === "data_quality" || i.issueType === "missing_email").length / total) * 100);
  const communicationScore = clamp(100 - input.communication.health.failures * 5);
  const paperworkScore = clamp(
    (input.paperwork.automationReadiness.readyForAutoSend /
      Math.max(1, input.paperwork.automationReadiness.readyForAutoSend + input.paperwork.automationReadiness.blocked)) *
      100,
  );
  const onboardingScore = clamp(input.orchestrator.executiveMetrics.workflowCompletions > 0 ? 75 : 60);

  const contributors = [
    { id: "automation", label: "Automation", score: automationScore, weight: 15, detail: "Orchestrator readiness" },
    { id: "workflow", label: "Workflow", score: workflowScore, weight: 20, detail: "Open workflow issues" },
    { id: "performance", label: "Performance", score: performanceScore, weight: 10, detail: "Critical incident load" },
    { id: "data", label: "Data", score: dataScore, weight: 15, detail: "Data quality signals" },
    { id: "communication", label: "Communication", score: communicationScore, weight: 10, detail: "Communication failures" },
    { id: "paperwork", label: "Paperwork", score: paperworkScore, weight: 15, detail: "Paperwork auto-readiness" },
    { id: "onboarding", label: "Onboarding", score: onboardingScore, weight: 15, detail: "Onboarding pipeline health" },
  ];

  const overall = clamp(contributors.reduce((sum, c) => sum + c.score * (c.weight / 100), 0));
  const improvements: string[] = [];
  if (critical > 0) improvements.push(`Resolve ${critical} critical operational issue${critical === 1 ? "" : "s"}`);
  if (paperworkScore < 70) improvements.push("Improve paperwork automation eligibility");
  if (dataScore < 80) improvements.push("Remediate missing candidate contact data");
  if (automationScore < 50) improvements.push("Increase cross-engine automation readiness");

  return {
    overall,
    contributors,
    summary: `Platform health: ${overall}%. ${input.issues.length} open operational signals detected.`,
    improvements: improvements.slice(0, 4),
  };
}
