import type { ApprovalDecision } from "@/lib/autonomous-paperwork-approval-engine/types";

export function explainApprovalDecision(input: {
  decision: ApprovalDecision;
  score: number;
  approvalReasons: string[];
  safetyReasons: string[];
  humanReviewReasons: string[];
  blockingReasons: string[];
}): string {
  const header = `${input.decision.replace(/_/g, " ")} — ${input.score}%`;
  const lines: string[] = [header, "", "Reasons:"];

  for (const reason of input.approvalReasons) {
    lines.push(`✓ ${reason}`);
  }
  for (const reason of input.safetyReasons) {
    lines.push(`✗ ${reason}`);
  }
  for (const reason of input.humanReviewReasons) {
    lines.push(`• ${reason}`);
  }
  for (const reason of input.blockingReasons) {
    lines.push(`• ${reason}`);
  }

  return lines.join("\n");
}
