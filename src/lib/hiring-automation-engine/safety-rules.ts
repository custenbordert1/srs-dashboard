import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { AutomationType } from "@/lib/hiring-automation-engine/types";
import { recommendNextStep } from "@/lib/hiring-automation-engine/recommend-next-step";

export type SafetyCheckResult = { allowed: boolean; reason: string };

export function checkAutomationSafety(
  type: AutomationType,
  row: ScoredCandidateWorkflowRow | undefined,
): SafetyCheckResult {
  switch (type) {
    case "send-paperwork": {
      if (!row) return { allowed: false, reason: "Candidate required for paperwork send." };
      const next = recommendNextStep(row);
      if (next.action !== "send-paperwork") {
        return { allowed: false, reason: next.reason };
      }
      if (row.candidateGrade.confidence === "low") {
        return { allowed: false, reason: "Cannot send paperwork with low confidence grade." };
      }
      if (row.paperworkStatus === "signed" || row.paperworkStatus === "sent" || row.paperworkStatus === "viewed") {
        return { allowed: false, reason: "Duplicate send blocked — paperwork already in flight or signed." };
      }
      return { allowed: true, reason: "Eligible for paperwork send." };
    }
    case "follow-up-paperwork":
      return { allowed: true, reason: "Follow-up task only — no automatic send." };
    case "mark-ready-for-mel": {
      if (!row) return { allowed: false, reason: "Candidate required." };
      if (row.paperworkStatus !== "signed" && row.workflowStatus !== "Signed") {
        return { allowed: false, reason: "Paperwork must be signed before Ready for MEL." };
      }
      return { allowed: true, reason: "Signed paperwork verified." };
    }
    case "close-pause-ad":
    case "create-new-ad":
    case "refresh-ad":
      return { allowed: true, reason: "Ad actions require explicit approval before execution." };
    case "escalate-recruiter-task":
      return { allowed: true, reason: "Task escalation only — no candidate status change." };
    default:
      return { allowed: false, reason: "Unknown automation type." };
  }
}

/** Never auto-reject — enforced by engine never creating reject/disqualify automations. */
export function rejectsCandidate(_type: AutomationType): boolean {
  return false;
}
