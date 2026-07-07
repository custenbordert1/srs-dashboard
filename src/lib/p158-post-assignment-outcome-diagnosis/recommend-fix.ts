import type { P1582BlockerCode } from "@/lib/p158-post-assignment-outcome-diagnosis/types";

const FIX_BY_CODE: Record<P1582BlockerCode, string> = {
  workflow_state_issue:
    "After P158 recruiter assignment, auto-advance workflow to Paperwork Needed and set actionType send-paperwork when hard blockers pass.",
  missing_questionnaire:
    "Trigger automated questionnaire request (Review Questionnaire path) before paperwork send.",
  missing_resume: "Recruiter requests resume upload; do not auto-send paperwork until resume is on file.",
  low_confidence:
    "Recruiter qualifies candidate (call/review) to raise advancement confidence above automation threshold.",
  duplicate: "Resolve duplicate record before any assignment or paperwork automation.",
  active_signature_request: "Wait for existing signature request to complete or expire.",
  already_sent: "Route to Wait For Candidate — packet already in flight.",
  invalid_email: "Collect valid email in Breezy before paperwork automation.",
  already_contacted_cooldown:
    "Wait for 3-day contact cooldown or document outreach outcome before paperwork send.",
  project_closed: "Reassign to open published job or reject candidate.",
  operational_fit_mismatch:
    "Map candidate to published operational need or escalate for manual placement review.",
  other: "Recruiter manual review — inspect applicant grade and workflow flags.",
};

export function recommendFixForBlocker(code: P1582BlockerCode): string {
  return FIX_BY_CODE[code];
}

export const P1582_SAFEST_NEXT_CHANGE =
  "Add a post-assignment workflow transition (P158.3): when recruiter is auto-assigned and immediate hard blockers pass, set workflowStatus=Paperwork Needed, actionType=send-paperwork, and re-run P157 — this removes the artificial gate causing 0/25 paperwork advancement without bypassing duplicate, email, or signature checks.";
