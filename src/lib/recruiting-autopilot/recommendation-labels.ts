import type { AutopilotRecommendationKind } from "@/lib/recruiting-autopilot/types";

export const AUTOPILOT_RECOMMENDATION_LABELS: Record<AutopilotRecommendationKind, string> = {
  "increase-ad-spend": "Increase Ad Spend",
  "refresh-job-posting": "Refresh Job Posting",
  "adjust-pay-rate": "Adjust Pay Rate",
  "expand-recruiting-radius": "Expand Recruiting Radius",
  "escalate-to-dm": "Escalate To DM",
  "assign-additional-recruiter": "Assign Additional Recruiter",
  "create-candidate-outreach-campaign": "Create Candidate Outreach Campaign",
  "reopen-previous-candidates": "Reopen Previous Candidates",
  "increase-follow-up-frequency": "Increase Follow-Up Frequency",
  "launch-territory-blitz": "Launch Territory Blitz",
};

/** Proxy for historical effectiveness by recommendation type (no external fetch). */
export const AUTOPILOT_HISTORICAL_EFFECTIVENESS: Record<AutopilotRecommendationKind, number> = {
  "increase-ad-spend": 72,
  "refresh-job-posting": 68,
  "adjust-pay-rate": 61,
  "expand-recruiting-radius": 64,
  "escalate-to-dm": 58,
  "assign-additional-recruiter": 70,
  "create-candidate-outreach-campaign": 66,
  "reopen-previous-candidates": 74,
  "increase-follow-up-frequency": 63,
  "launch-territory-blitz": 77,
};
