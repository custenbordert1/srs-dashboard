import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";

export type DmPortalCardMetrics = {
  openJobs: number;
  applicants: number;
  openCalls: number;
  activeReps: number;
  coveragePercent: number;
  needsAttention: number;
};

/**
 * Derives DM portal card values from an existing `/api/dm/dashboard` snapshot.
 * Rep counts use onboarding + pipeline proxies until a dedicated rep roster is on the DM API.
 */
export function buildDmPortalCardMetrics(snapshot: DmDashboardSnapshot): DmPortalCardMetrics {
  const openCallsFromCoverage = snapshot.coverage.candidateShortagesByState.reduce(
    (sum, bar) => sum + bar.value,
    0,
  );
  const openCallsFromMel = snapshot.melMatching.unstaffedHighPriorityStores.length;
  const openCalls = openCallsFromCoverage > 0 ? openCallsFromCoverage : openCallsFromMel;

  const activeReps =
    snapshot.onboarding.paperworkSigned +
    snapshot.onboarding.ddApproved +
    snapshot.pipeline.counts.hired;

  const coveragePercent = snapshot.health.score;

  const needsAttention =
    snapshot.alertSummary.criticalCount +
    snapshot.alertSummary.highCount +
    snapshot.alertSummary.mediumCount;

  return {
    openJobs: snapshot.activeJobs,
    applicants: snapshot.candidatesLast7Days,
    openCalls,
    activeReps,
    coveragePercent,
    needsAttention,
  };
}
