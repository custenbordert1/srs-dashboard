import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  candidatesForJob,
  daysSince,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SuggestedActionType =
  | "increase-pay"
  | "repost-ad"
  | "expand-radius"
  | "add-nearby-cities"
  | "prioritize-follow-up"
  | "alternate-candidate-pools";

export type SuggestedActionPriority = "high" | "medium" | "low";

export type SuggestedAction = {
  id: string;
  type: SuggestedActionType;
  priority: SuggestedActionPriority;
  title: string;
  detail: string;
  jobId?: string;
  city?: string;
  state?: string;
};

const PRIORITY_RANK: Record<SuggestedActionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function buildSuggestedActions(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  limit = 20,
): SuggestedAction[] {
  const reference = new Date(referenceIso);
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const actions: SuggestedAction[] = [];

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    const recent = jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since7d;
    });
    const interviewing = jobCandidates.filter((c) => isInterviewingStage(c.stage));
    const age = daysSince(job.createdDate || job.updatedDate, reference);

    if (recent.length === 0) {
      actions.push({
        id: `repost-${job.jobId}`,
        type: "repost-ad",
        priority: "high",
        title: "Repost job ad",
        detail: `${job.name} (${job.city}, ${job.state}) — no applicants in 7 days.`,
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
      actions.push({
        id: `expand-${job.jobId}`,
        type: "expand-radius",
        priority: "high",
        title: "Expand search radius",
        detail: `Broaden geo targeting for ${job.name} to pull nearby talent.`,
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (age !== null && age >= 21 && jobCandidates.length < 5) {
      actions.push({
        id: `pay-${job.jobId}`,
        type: "increase-pay",
        priority: "high",
        title: "Consider pay increase",
        detail: `${job.name} aging ${age}d with only ${jobCandidates.length} applicant(s).`,
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (jobCandidates.length >= 3 && interviewing.length === 0) {
      actions.push({
        id: `followup-${job.jobId}`,
        type: "prioritize-follow-up",
        priority: "medium",
        title: "Prioritize recruiter follow-up",
        detail: `${job.name}: ${jobCandidates.length} applicants, none in interview stages.`,
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (recent.length > 0 && recent.length < 2 && age !== null && age >= 14) {
      actions.push({
        id: `cities-${job.jobId}`,
        type: "add-nearby-cities",
        priority: "medium",
        title: "Add nearby cities",
        detail: `Low flow in ${job.city}, ${job.state} — expand posting to adjacent markets.`,
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }

    if (jobCandidates.length === 0 && age !== null && age >= 7) {
      actions.push({
        id: `pools-${job.jobId}`,
        type: "alternate-candidate-pools",
        priority: "medium",
        title: "Tap alternate candidate pools",
        detail: `Source from referrals, Indeed sponsored, and past qualified resets for ${job.name}.`,
        jobId: job.jobId,
        city: job.city,
        state: job.state,
      });
    }
  }

  return actions
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}
