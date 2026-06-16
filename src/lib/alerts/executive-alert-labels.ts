import type { ExecutiveAlert } from "@/lib/alerts/alert-types";

export const ACTION_LABELS: Record<ExecutiveAlert["recommendedAction"], string> = {
  "create-job-ad": "Create job ad",
  "assign-recruiter": "Assign recruiter",
  "notify-dm": "Notify DM",
  "territory-escalation": "Territory escalation",
  "placement-review": "Review placement",
  "candidate-followup": "Candidate follow-up",
  "paperwork-review": "Review paperwork",
};
