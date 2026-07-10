import { P158_HIGH_CONFIDENCE_THRESHOLD } from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import type { RecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/types";

export function computeP158AssignmentConfidence(input: {
  baseConfidence: number;
  priorityScore: number;
  openDemand: number;
  recruiterWorkload: number;
  stateOwned: number;
}): number {
  let score = input.baseConfidence;

  if (input.priorityScore >= 75) score += 4;
  if (input.openDemand >= 15) score += 3;
  if (input.openDemand >= 30) score += 2;
  if (input.stateOwned > 0) score += 5;
  score -= Math.min(8, Math.max(0, input.recruiterWorkload - 8));

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function isHighConfidenceAssignment(confidence: number): boolean {
  return confidence >= P158_HIGH_CONFIDENCE_THRESHOLD;
}

export function extractStateOwnership(decision: RecruiterAssignmentDecision, reason: string): number {
  const match = reason.match(/owns (\d+) candidate/);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}
