import type { P156PriorityFactorId } from "@/lib/p156-candidate-prioritization/types";

/** Configurable factor weights — must sum to 100. Adjust here without changing scoring logic. */
export const P156_FACTOR_WEIGHTS: Record<P156PriorityFactorId, number> = {
  projectUrgency: 10,
  daysUntilProjectStart: 9,
  openCallDemand: 10,
  applicationAge: 8,
  distanceToOpenStores: 8,
  candidateStage: 9,
  recruiterAssignmentStatus: 8,
  previousResponsiveness: 6,
  paperworkCompletionLikelihood: 9,
  activeHiringCampaigns: 5,
  continuityVsOneTime: 4,
  territoryShortages: 7,
  candidateQuality: 7,
};

export const P156_FACTOR_LABELS: Record<P156PriorityFactorId, string> = {
  projectUrgency: "Project urgency",
  daysUntilProjectStart: "Days until project start",
  openCallDemand: "Open call demand",
  applicationAge: "Application age",
  distanceToOpenStores: "Distance to open stores",
  candidateStage: "Candidate stage",
  recruiterAssignmentStatus: "Recruiter assignment",
  previousResponsiveness: "Previous responsiveness",
  paperworkCompletionLikelihood: "Paperwork completion likelihood",
  activeHiringCampaigns: "Active hiring campaigns",
  continuityVsOneTime: "Continuity vs one-time",
  territoryShortages: "Territory shortages",
  candidateQuality: "Candidate quality",
};

export const P156_CRITICAL_THRESHOLD = 85;
export const P156_HIGH_THRESHOLD = 70;
export const P156_MEDIUM_THRESHOLD = 45;

/** Minimum weighted contribution (points) to include in human-readable reasoning. */
export const P156_EXPLANATION_MIN_CONTRIBUTION = 3;

export const P156_CLIENT_REQUEST_TIMEOUT_MS = 8_000;
export const P156_SERVER_BREEZY_TIMEOUT_MS = 5_000;

export const P156_PROJECT_URGENCY_SCORES = {
  Critical: 100,
  "At Risk": 78,
  Watch: 52,
  Healthy: 18,
} as const;

export const P156_DAYS_UNTIL_START_THRESHOLDS = [
  { maxDays: 3, score: 100 },
  { maxDays: 7, score: 82 },
  { maxDays: 14, score: 64 },
  { maxDays: 30, score: 42 },
  { maxDays: Number.POSITIVE_INFINITY, score: 20 },
] as const;

export const P156_OPEN_CALL_DEMAND_CAP = 50;

export function assertP156WeightsSumTo100(): void {
  const sum = Object.values(P156_FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`P156 factor weights must sum to 100 (got ${sum})`);
  }
}
