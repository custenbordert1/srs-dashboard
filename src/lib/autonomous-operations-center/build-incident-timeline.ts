import type { OperationalIncident, OperationalIssue } from "@/lib/autonomous-operations-center/types";

export function buildOperationalIncidents(input: {
  issues: OperationalIssue[];
  fetchedAt: string;
  referenceMs: number;
}): { open: OperationalIncident[]; resolved: OperationalIncident[] } {
  const open: OperationalIncident[] = input.issues.map((issue) => {
    const detectedAt = issue.detectedAt;
    return {
      incidentId: `inc-${issue.issueId}`,
      issueType: issue.issueType,
      severity: issue.severity,
      status: "open" as const,
      engine: issue.responsibleEngine,
      title: issue.issueType.replace(/_/g, " "),
      impact: issue.reason,
      detectedAt,
      updatedAt: input.fetchedAt,
      resolvedAt: null,
      durationMs: Date.parse(input.fetchedAt) - Date.parse(detectedAt),
      recommendedResolution: issue.recommendedAction,
      affectedCount: issue.affectedCandidateIds.length,
      auditTrail: [
        { at: detectedAt, event: "detected", detail: issue.reason },
        { at: input.fetchedAt, event: "updated", detail: "Preview monitoring refresh" },
      ],
    };
  });

  const resolved: OperationalIncident[] = open
    .filter((inc) => inc.severity === "low")
    .slice(0, 5)
    .map((inc) => ({
      ...inc,
      status: "simulated_resolved" as const,
      resolvedAt: input.fetchedAt,
      auditTrail: [
        ...inc.auditTrail,
        { at: input.fetchedAt, event: "resolved", detail: "Simulated resolution in preview mode" },
      ],
    }));

  return { open, resolved };
}
