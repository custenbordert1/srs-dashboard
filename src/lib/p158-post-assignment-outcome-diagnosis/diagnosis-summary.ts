import type {
  P1582BlockerClass,
  P1582BlockerCode,
  P1582BlockerCount,
  P1582CandidateDiagnosis,
  P1582DiagnosisSummary,
} from "@/lib/p158-post-assignment-outcome-diagnosis/types";
import { P1582_SAFEST_NEXT_CHANGE } from "@/lib/p158-post-assignment-outcome-diagnosis/recommend-fix";
import { classifyBlocker, isAutomatableBlocker } from "@/lib/p158-post-assignment-outcome-diagnosis/classify-blocker";

const BLOCKED_ACTIONS = new Set(["Candidate Duplicate", "Position Closed", "Reject Candidate"]);

export function buildDiagnosisSummary(candidates: P1582CandidateDiagnosis[]): P1582DiagnosisSummary {
  const blockerMap = new Map<P1582BlockerCode, P1582BlockerCount>();
  const classCounts: Record<P1582BlockerClass, number> = {
    true_business_requirement: 0,
    safe_to_automate: 0,
    artificial_workflow_gate: 0,
    remain_manual_review: 0,
  };

  let sendPaperworkCount = 0;
  let manualReviewCount = 0;
  let blockedCount = 0;
  let otherActionCount = 0;
  let automatableWorkflowGate = 0;

  for (const row of candidates) {
    classCounts[row.blockerClass] += 1;

    const existing = blockerMap.get(row.primaryBlocker) ?? {
      code: row.primaryBlocker,
      count: 0,
      blockerClass: row.blockerClass,
      automatableCount: 0,
    };
    existing.count += 1;
    if (row.automatable) existing.automatableCount += 1;
    blockerMap.set(row.primaryBlocker, existing);

    if (row.postAssignmentAction === "Send Paperwork" || row.postAssignmentAction === "Ready For MEL") {
      sendPaperworkCount += 1;
    } else if (row.postAssignmentAction === "Manual Review") {
      manualReviewCount += 1;
    } else if (BLOCKED_ACTIONS.has(row.postAssignmentAction) || row.postAssignmentAction === "Blocked") {
      blockedCount += 1;
    } else {
      otherActionCount += 1;
    }

    if (row.primaryBlocker === "workflow_state_issue" && row.automatable) {
      automatableWorkflowGate += 1;
    }
  }

  const blockerCounts = [...blockerMap.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    candidatesDiagnosed: candidates.length,
    sendPaperworkCount,
    manualReviewCount,
    blockedCount,
    otherActionCount,
    blockerCounts,
    classCounts,
    safestNextChange: P1582_SAFEST_NEXT_CHANGE,
    estimatedPaperworkLift: automatableWorkflowGate,
  };
}
