import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  candidatesForJob,
  daysSince,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RecruitingRecommendationUrgency = "critical" | "high" | "medium" | "low";

export type RecruitingRecommendationType =
  | "increase-pay"
  | "expand-radius"
  | "repost-timing"
  | "nearby-cities"
  | "recruiter-intervention"
  | "dm-follow-up"
  | "alternate-pools";

export type RecruitingRecommendation = {
  id: string;
  type: RecruitingRecommendationType;
  recommendation: string;
  reason: string;
  impactEstimate: string;
  urgency: RecruitingRecommendationUrgency;
  jobId?: string;
  city?: string;
  state?: string;
};

const URGENCY_RANK: Record<RecruitingRecommendationUrgency, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const NEARBY_CITY_HINTS: Record<string, string[]> = {
  TX: ["Dallas", "Houston", "San Antonio", "Austin"],
  CA: ["Los Angeles", "San Diego", "Sacramento", "Fresno"],
  FL: ["Tampa", "Orlando", "Jacksonville", "Miami"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Dayton"],
};

function nearbyCitySuggestion(state: string, city: string): string {
  const code = state.trim().toUpperCase().slice(0, 2);
  const hints = NEARBY_CITY_HINTS[code] ?? [];
  const alt = hints.find((c) => !city.toLowerCase().includes(c.toLowerCase()));
  return alt ? `Expand posting to ${alt} and adjacent metros` : "Add adjacent metro markets to the posting";
}

export function buildRecruitingRecommendations(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  limit = 24,
): RecruitingRecommendation[] {
  const reference = new Date(referenceIso);
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const recommendations: RecruitingRecommendation[] = [];

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    const recent = jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since7d;
    });
    const interviewing = jobCandidates.filter((c) => isInterviewingStage(c.stage));
    const age = daysSince(job.createdDate || job.updatedDate, reference);

    if (recent.length === 0) {
      recommendations.push({
        id: `repost-${job.jobId}`,
        type: "repost-timing",
        recommendation: "Repost job ad on peak boards",
        reason: `${job.name} (${job.city}, ${job.state}) — no applicants in 7 days.`,
        impactEstimate: "+3–8 applicants within 72h",
        urgency: "high",
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
      recommendations.push({
        id: `radius-${job.jobId}`,
        type: "expand-radius",
        recommendation: "Expand search radius by 15–25 miles",
        reason: "Geo pool may be too narrow for current market density.",
        impactEstimate: "+20–35% qualified reach",
        urgency: "high",
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (age !== null && age >= 21 && jobCandidates.length < 5) {
      recommendations.push({
        id: `pay-${job.jobId}`,
        type: "increase-pay",
        recommendation: "Review pay rate vs market median",
        reason: `${job.name} aging ${age}d with only ${jobCandidates.length} applicant(s).`,
        impactEstimate: "+15–25% applicant velocity",
        urgency: age >= 30 ? "critical" : "high",
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (jobCandidates.length >= 3 && interviewing.length === 0) {
      recommendations.push({
        id: `recruiter-${job.jobId}`,
        type: "recruiter-intervention",
        recommendation: "Schedule recruiter outreach blitz",
        reason: `${jobCandidates.length} applicants with zero interview movement.`,
        impactEstimate: "2–4 interviews within 5 business days",
        urgency: "medium",
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (recent.length > 0 && recent.length < 2 && age !== null && age >= 14) {
      recommendations.push({
        id: `cities-${job.jobId}`,
        type: "nearby-cities",
        recommendation: nearbyCitySuggestion(job.state, job.city),
        reason: `Low flow in ${job.city}, ${job.state}.`,
        impactEstimate: "+1–3 applicants per adjacent market",
        urgency: "medium",
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (age !== null && age >= 28 && interviewing.length === 0) {
      recommendations.push({
        id: `dm-${job.jobId}`,
        type: "dm-follow-up",
        recommendation: "DM territory review and coverage check",
        reason: `Aging role with no interview pipeline — territory coverage may be at risk.`,
        impactEstimate: "Accelerated fill decision within 1 week",
        urgency: "high",
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (jobCandidates.length === 0 && age !== null && age >= 7) {
      recommendations.push({
        id: `pools-${job.jobId}`,
        type: "alternate-pools",
        recommendation: "Tap referrals, Indeed sponsored, and past reset talent",
        reason: `Zero applicants after ${age} days open.`,
        impactEstimate: "+5–12 sourced candidates",
        urgency: "medium",
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }
  }

  return recommendations
    .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
    .slice(0, limit);
}

/** Map to legacy SuggestedAction shape for existing UI components */
export type SuggestedActionPriority = "high" | "medium" | "low";

export type SuggestedAction = {
  id: string;
  type:
    | "increase-pay"
    | "repost-ad"
    | "expand-radius"
    | "add-nearby-cities"
    | "prioritize-follow-up"
    | "alternate-candidate-pools";
  priority: SuggestedActionPriority;
  title: string;
  detail: string;
  jobId?: string;
  city?: string;
  state?: string;
};

function mapType(type: RecruitingRecommendationType): SuggestedAction["type"] {
  switch (type) {
    case "increase-pay":
      return "increase-pay";
    case "expand-radius":
      return "expand-radius";
    case "repost-timing":
      return "repost-ad";
    case "nearby-cities":
      return "add-nearby-cities";
    case "recruiter-intervention":
      return "prioritize-follow-up";
    case "dm-follow-up":
      return "prioritize-follow-up";
    case "alternate-pools":
      return "alternate-candidate-pools";
  }
}

function mapUrgency(urgency: RecruitingRecommendationUrgency): SuggestedActionPriority {
  if (urgency === "critical" || urgency === "high") return "high";
  if (urgency === "medium") return "medium";
  return "low";
}

export function buildSuggestedActions(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  limit = 20,
): SuggestedAction[] {
  return buildRecruitingRecommendations(jobs, candidates, referenceIso, limit).map((rec) => ({
    id: rec.id,
    type: mapType(rec.type),
    priority: mapUrgency(rec.urgency),
    title: rec.recommendation,
    detail: `${rec.reason} · ${rec.impactEstimate}`,
    jobId: rec.jobId,
    city: rec.city,
    state: rec.state,
  }));
}
