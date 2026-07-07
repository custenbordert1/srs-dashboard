export function buildAssignmentExplanation(input: {
  territoryState: string | null;
  dmName: string | null;
  recommendedRecruiter: string | null;
  openDemand: number;
  recruiterWorkload: number;
  assignmentReason: string;
  priorityScore: number;
  maxReasons?: number;
}): string[] {
  const reasons: string[] = [];
  const max = input.maxReasons ?? 6;

  if (input.territoryState) reasons.push(`Territory: ${input.territoryState}`);
  if (input.dmName) reasons.push(`DM: ${input.dmName}`);
  if (input.recommendedRecruiter) reasons.push(`Best recruiter: ${input.recommendedRecruiter}`);
  if (input.openDemand > 0) reasons.push(`${input.openDemand} open calls in territory`);
  if (input.recruiterWorkload > 0) reasons.push(`Recruiter workload: ${input.recruiterWorkload} candidates`);
  if (input.priorityScore >= 70) reasons.push(`High P156 priority (${input.priorityScore})`);
  if (input.assignmentReason) reasons.push(input.assignmentReason);

  const unique = [...new Set(reasons.map((r) => r.trim()).filter(Boolean))];
  return unique.slice(0, max);
}
