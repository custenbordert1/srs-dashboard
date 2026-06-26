import type { OrchestratorDashboardSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { OperationalIssue } from "@/lib/autonomous-operations-center/types";
import type { EngineMonitoringReport, OperationsHealthStatus } from "@/lib/autonomous-operations-center/types";

const ENGINE_LABELS: Record<string, string> = {
  recruiting: "Recruiting",
  paperwork: "Paperwork",
  execution: "Execution",
  communication: "Communication",
  onboarding: "Onboarding",
  executive: "Executive",
  orchestrator: "Orchestrator",
  operations: "Operations",
};

function mapStatus(status: string, openIssues: number): OperationsHealthStatus {
  if (status === "offline") return "offline";
  if (status === "blocked" || openIssues > 5) return "critical";
  if (status === "warning" || openIssues > 0) return "warning";
  return "healthy";
}

export function buildEngineMonitoringReports(input: {
  orchestrator: OrchestratorDashboardSnapshot;
  issues: OperationalIssue[];
}): EngineMonitoringReport[] {
  const issueCountByEngine = new Map<string, number>();
  for (const issue of input.issues) {
    issueCountByEngine.set(issue.responsibleEngine, (issueCountByEngine.get(issue.responsibleEngine) ?? 0) + 1);
  }

  const orchestratorEngines = input.orchestrator.engineHealth.map((e) => ({
    engineId: e.engineId.replace("recruiting_intelligence", "recruiting").replace("paperwork_intelligence", "paperwork").replace("paperwork_execution", "execution") as EngineMonitoringReport["engineId"],
    label: e.label,
    baseStatus: e.status,
    explanation: e.explanation,
  }));

  const reports: EngineMonitoringReport[] = orchestratorEngines.map((e) => {
    const openIssues = issueCountByEngine.get(e.engineId) ?? 0;
    return {
      engineId: e.engineId,
      label: e.label,
      status: mapStatus(e.baseStatus, openIssues),
      explanation: openIssues > 0 ? `${e.explanation} (${openIssues} open issues)` : e.explanation,
      openIssues,
    };
  });

  reports.push({
    engineId: "orchestrator",
    label: ENGINE_LABELS.orchestrator,
    status: mapStatus("healthy", issueCountByEngine.get("orchestrator") ?? 0),
    explanation: `Readiness ${input.orchestrator.readinessScore.overall}%`,
    openIssues: issueCountByEngine.get("orchestrator") ?? 0,
  });

  reports.push({
    engineId: "operations",
    label: ENGINE_LABELS.operations,
    status: mapStatus(input.issues.some((i) => i.severity === "critical") ? "warning" : "healthy", issueCountByEngine.get("operations") ?? 0),
    explanation: "P75 operations monitoring active in preview.",
    openIssues: issueCountByEngine.get("operations") ?? 0,
  });

  return reports;
}
