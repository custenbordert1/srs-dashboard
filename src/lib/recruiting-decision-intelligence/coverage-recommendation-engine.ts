import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import {
  candidatesForJob,
  daysSince,
  isHiredStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import { expandMetroCities } from "@/lib/job-management/job-metro-expansion";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import { milesBetweenRepAndProject } from "@/lib/rep-intelligence/distance-engine";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { CoverageRecommendation } from "@/lib/recruiting-decision-intelligence/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isRelatedVariantDraft(draft: JobDraft, jobId: string, state: string): boolean {
  if (!draft.variant) return false;
  const sourceId = draft.variant.sourceJobId || draft.clonedFromBreezyJobId;
  if (sourceId !== jobId) return false;
  return draft.usState.trim().toUpperCase() === state.trim().toUpperCase();
}

function countActiveRepsNear(
  reps: ActiveRep[],
  city: string,
  state: string,
  radiusMiles: number,
): number {
  let count = 0;
  const project = { city, state };
  for (const rep of reps) {
    if (!rep.active) continue;
    const miles = milesBetweenRepAndProject(rep, project);
    if (miles !== null && miles <= radiusMiles) count += 1;
  }
  return count;
}

function applicants7dByCity(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  reference: Date,
): Map<string, number> {
  const since = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const key = `${normalizeJobLocationFields(job.city, job.state).city}|${job.state}`;
    const jobCandidates = candidatesForJob(job, candidates);
    const recent = jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since;
    }).length;
    counts.set(key, (counts.get(key) ?? 0) + recent);
  }
  return counts;
}

function daysWithoutHire(job: BreezyJob, candidates: BreezyCandidate[]): number | null {
  const jobCandidates = candidatesForJob(job, candidates);
  let lastHire: Date | null = null;
  for (const candidate of jobCandidates) {
    if (!isHiredStage(candidate.stage)) continue;
    const applied = parseDate(candidate.appliedDate);
    if (applied && (!lastHire || applied > lastHire)) lastHire = applied;
  }
  if (!lastHire) return null;
  return daysSince(lastHire.toISOString(), new Date());
}

function staffingRiskScore(job: BreezyJob, candidates: BreezyCandidate[], alert: DmPrioritizedAlert | null): number {
  const base = alert?.priorityScore ?? 0;
  const age = daysSince(job.createdDate || job.updatedDate, new Date()) ?? 0;
  const applicants = candidatesForJob(job, candidates).length;
  return base + Math.min(age, 60) + (applicants === 0 ? 40 : 0);
}

function buildSummaryBullets(signals: Omit<CoverageRecommendation, "summaryBullets">): string[] {
  const bullets: string[] = [];
  if (signals.recommendedExpansionCities.length > 1) {
    bullets.push(
      `Recommend expanding from ${signals.city} → ${signals.recommendedExpansionCities.slice(1, 3).join(" + ")}`,
    );
  }
  if (signals.nearbyActiveReps25Mi > 0) {
    bullets.push(`${signals.nearbyActiveReps25Mi} active rep(s) within 25 miles`);
  }
  if (signals.publishedVariantsNearby > 0) {
    bullets.push(`${signals.publishedVariantsNearby} published variant(s) nearby`);
  }
  if (signals.strongerApplicantFlowCities.length > 0) {
    bullets.push(
      `Nearby variant in ${signals.strongerApplicantFlowCities[0]} performing better`,
    );
  }
  if (signals.daysWithoutHire !== null && signals.daysWithoutHire >= 21) {
    bullets.push(`No hires in city for ${signals.daysWithoutHire} days`);
  }
  if (signals.nearbyActiveReps25Mi === 0) {
    bullets.push("Consider route assignment coverage");
  }
  if (signals.pendingVariantsNearby > 0) {
    bullets.push(`Review pending variant before repost (group has ${signals.pendingVariantsNearby} pending)`);
  }
  return bullets.slice(0, 6);
}

export function buildCoverageRecommendations(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  drafts: JobDraft[];
  escalations: RecruiterEscalationQueueItem[];
  activeReps: ActiveRep[];
  referenceIso: string;
  limit?: number;
}): CoverageRecommendation[] {
  const reference = new Date(input.referenceIso);
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const alertByJob = new Map<string, DmPrioritizedAlert>();

  const escalationJobIds = new Set(
    input.escalations
      .filter((row) => row.status === "new" || row.status === "in_review")
      .map((row) => row.relatedJobId),
  );

  const cityFlow = applicants7dByCity(input.jobs, input.candidates, reference);
  const jobsByState = new Map<string, number>();
  for (const job of input.jobs) {
    const state = job.state.trim().toUpperCase();
    jobsByState.set(state, (jobsByState.get(state) ?? 0) + 1);
  }

  const highRiskJobs = input.jobs.filter((job) => {
    if (escalationJobIds.has(job.jobId)) return true;
    const jobCandidates = candidatesForJob(job, input.candidates);
    const recent = jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since7d;
    }).length;
    const age = daysSince(job.createdDate || job.updatedDate, reference) ?? 0;
    if (recent === 0 && age >= 7) return true;
    if (age >= 21 && jobCandidates.length < 5) return true;
    return false;
  });

  const recommendations: CoverageRecommendation[] = [];

  for (const job of highRiskJobs) {
    const location = normalizeJobLocationFields(job.city, job.state);
    const alert = alertByJob.get(job.jobId) ?? null;
    const expansion = expandMetroCities(location.city, location.usState, 5);
    const metroJobs = input.jobs.filter((row) => {
      const rowLoc = normalizeJobLocationFields(row.city, row.state);
      return expansion.some(
        (city) => city.toLowerCase() === rowLoc.city.toLowerCase() && row.state === job.state,
      );
    });

    const strongerApplicantFlowCities = expansion
      .filter((city) => city.toLowerCase() !== location.city.toLowerCase())
      .map((city) => {
        const key = `${city}|${job.state}`;
        return { city, count: cityFlow.get(key) ?? 0 };
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((row) => row.city);

    const stateJobs = jobsByState.get(job.state.trim().toUpperCase()) ?? 1;
    const stateReps = input.activeReps.filter(
      (rep) => rep.active && rep.state.trim().toUpperCase() === job.state.trim().toUpperCase(),
    ).length;
    const saturation = stateReps > 0 ? Math.round((stateJobs / stateReps) * 10) / 10 : stateJobs;

    let pendingVariantsNearby = 0;
    let approvedUnpublishedVariantsNearby = 0;
    let publishedVariantsNearby = 0;
    for (const draft of input.drafts) {
      if (!isRelatedVariantDraft(draft, job.jobId, job.state)) continue;
      if (draft.variant?.queueStatus === "pending") pendingVariantsNearby += 1;
      else if (draft.variant?.queueStatus === "approved" && draft.status === "draft") {
        approvedUnpublishedVariantsNearby += 1;
      } else if (draft.variant?.queueStatus === "published" || draft.status === "published") {
        publishedVariantsNearby += 1;
      }
    }

    const signals: Omit<CoverageRecommendation, "summaryBullets"> = {
      jobId: job.jobId,
      jobTitle: job.name,
      city: location.city,
      state: location.usState,
      nearbyActiveReps25Mi: countActiveRepsNear(input.activeReps, location.city, location.usState, 25),
      pendingVariantsNearby,
      approvedUnpublishedVariantsNearby,
      publishedVariantsNearby,
      strongerApplicantFlowCities: strongerApplicantFlowCities.slice(0, 3),
      territorySaturationScore: saturation,
      openOpportunityCount: metroJobs.length,
      staffingRiskScore: staffingRiskScore(job, input.candidates, alert),
      recommendedExpansionCities: expansion,
      recommendedExpansionRadiusMiles: strongerApplicantFlowCities.length > 0 ? 25 : 40,
      daysWithoutHire: daysWithoutHire(job, input.candidates),
      jobAgeDays: daysSince(job.createdDate || job.updatedDate, reference),
    };

    recommendations.push({
      ...signals,
      summaryBullets: buildSummaryBullets(signals),
    });
  }

  return recommendations
    .sort((a, b) => b.staffingRiskScore - a.staffingRiskScore)
    .slice(0, input.limit ?? 30);
}
