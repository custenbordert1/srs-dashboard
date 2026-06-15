import type { ActionRecommendationCategory } from "@/lib/territory-action-engine/types";

export const ACTION_CATEGORY_LABELS: Record<ActionRecommendationCategory, string> = {
  "critical-territory": "Critical Territory",
  "coverage-risk": "Coverage Risk",
  "zero-applicant-jobs": "Zero Applicant Jobs",
  "paperwork-aging": "Paperwork Aging",
  "open-calls-at-risk": "Open Calls At Risk",
  "recruiter-follow-up-risk": "Recruiter Follow-Up Risk",
  "project-risk": "Project Risk",
  "rep-shortage": "Rep Shortage",
  "staffing-shortage": "Staffing Shortage",
  "recruiter-overload": "Recruiter Overload",
  "dm-escalation": "DM Escalation",
};

export function categoryLabel(category: ActionRecommendationCategory): string {
  return ACTION_CATEGORY_LABELS[category];
}

export function impactScoreFromSeverity(severity: "critical" | "high" | "medium"): number {
  switch (severity) {
    case "critical":
      return 92;
    case "high":
      return 74;
    default:
      return 52;
  }
}

export function dueDateFromImpactScore(impactScore: number, referenceMs = Date.now()): string {
  const days =
    impactScore >= 85 ? 1 : impactScore >= 70 ? 3 : impactScore >= 55 ? 5 : 7;
  const due = new Date(referenceMs);
  due.setDate(due.getDate() + days);
  return due.toISOString().slice(0, 10);
}

export function sortByImpact<T extends { impactScore: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.impactScore - a.impactScore);
}
