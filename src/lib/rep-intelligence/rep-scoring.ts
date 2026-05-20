import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

export function repReliabilityScore(rep: ActiveRep): number {
  const completion = Math.min(40, Math.round(rep.completionRate * 0.4));
  const noShowPenalty = Math.min(25, Math.round(rep.noShowRate * 0.5));
  const activityBoost = rep.active ? 10 : 0;
  const trainingBoost =
    rep.trainingStatus === "certified" ? 8 : rep.trainingStatus === "in_training" ? 4 : 0;
  return Math.max(5, Math.min(100, completion + activityBoost + trainingBoost - noShowPenalty + 35));
}

export function repUtilizationPercent(rep: ActiveRep): number {
  const total = rep.openAssignments + rep.completedAssignments;
  if (total === 0) return 0;
  return Math.round((rep.openAssignments / total) * 100);
}

export function inferSkillsFromProjects(projectTypes: string[]): string[] {
  const skills = new Set<string>();
  for (const type of projectTypes) {
    const t = type.toLowerCase();
    if (t.includes("reset")) skills.add("reset");
    if (t.includes("merchandis")) skills.add("merchandising");
    if (t.includes("grocery")) skills.add("grocery");
    if (t.includes("fixture")) skills.add("fixtures");
    if (t.includes("osa")) skills.add("osa");
    if (t.includes("walmart")) skills.add("walmart");
    if (t.includes("target")) skills.add("target");
  }
  return [...skills];
}
