import { normalizeStateCode } from "@/lib/dm-territory-map";
import type {
  DmOperatingSystemScope,
  DmRecruiterPerformanceRow,
  DmRecruiterPerformanceTier,
} from "@/lib/dm-operating-system/types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildRecruiterProductivityLive } from "@/lib/recruiting-automation/recruiter-productivity-live";
import { candidatesForJob, isHiredStage } from "@/lib/dm-dashboard/territory-shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function candidateInScope(
  candidateState: string | undefined,
  scope: DmOperatingSystemScope,
): boolean {
  if (!scope.scopedToTerritory || scope.territoryStates.length === 0) return true;
  if (!candidateState) return false;
  return scope.territoryStates.includes(normalizeStateCode(candidateState));
}

function followUpCompletionPercent(
  recruiter: string,
  followUps: ExecutiveAlertFollowUp[],
): number {
  const owned = followUps.filter(
    (row) => row.ownerKind === "recruiter" && row.ownerName.trim() === recruiter,
  );
  if (owned.length === 0) return 100;
  const completed = owned.filter((row) => row.completedAt).length;
  return Math.round((completed / owned.length) * 100);
}

function performanceTier(score: number): DmRecruiterPerformanceTier {
  if (score >= 70) return "top";
  if (score < 40) return "needs-support";
  return "average";
}

function compositeScore(row: {
  candidatePipeline: number;
  followUpCompletionPercent: number;
  hiringVelocity: number;
  coverageContribution: number;
}): number {
  return Math.round(
    row.candidatePipeline * 0.2 +
      row.followUpCompletionPercent * 0.25 +
      row.hiringVelocity * 8 +
      row.coverageContribution * 0.35,
  );
}

export function buildRecruiterPerformance(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  followUps: ExecutiveAlertFollowUp[];
  scope: DmOperatingSystemScope;
}): {
  recruiters: DmRecruiterPerformanceRow[];
  topPerformers: string[];
  needsSupport: string[];
} {
  const { bundle, followUps, scope } = input;
  const reference = Date.parse(bundle.fetchedAt);
  const since7d = reference - 7 * MS_PER_DAY;

  const liveRows = buildRecruiterProductivityLive(
    bundle.candidates,
    bundle.workflows,
    bundle.fetchedAt,
  );

  const openReqsByRecruiter = new Map<string, number>();
  for (const job of bundle.jobs) {
    if (!job.state || !candidateInScope(job.state, scope)) continue;
    const jobCandidates = candidatesForJob(job, bundle.candidates);
    const recruiterCounts = new Map<string, number>();
    for (const candidate of jobCandidates) {
      const recruiter = bundle.workflows[candidate.candidateId]?.assignedRecruiter?.trim();
      if (!recruiter) continue;
      recruiterCounts.set(recruiter, (recruiterCounts.get(recruiter) ?? 0) + 1);
    }
    let assigned = "Unassigned";
    let best = 0;
    for (const [name, count] of recruiterCounts) {
      if (count > best) {
        assigned = name;
        best = count;
      }
    }
    openReqsByRecruiter.set(assigned, (openReqsByRecruiter.get(assigned) ?? 0) + 1);
  }

  const pipelineByRecruiter = new Map<string, number>();
  const hiresByRecruiter = new Map<string, number>();
  for (const candidate of bundle.candidates) {
    const state = candidate.state;
    if (!candidateInScope(state, scope)) continue;
    const record = bundle.workflows[candidate.candidateId];
    const recruiter = record?.assignedRecruiter?.trim() || "Unassigned";
    pipelineByRecruiter.set(recruiter, (pipelineByRecruiter.get(recruiter) ?? 0) + 1);
    const applied = Date.parse(candidate.appliedDate ?? "");
    if (isHiredStage(candidate.stage)) {
      hiresByRecruiter.set(recruiter, (hiresByRecruiter.get(recruiter) ?? 0) + 1);
    } else if (!Number.isNaN(applied) && applied >= since7d) {
      hiresByRecruiter.set(recruiter, hiresByRecruiter.get(recruiter) ?? 0);
    }
  }

  const territoryOpenCalls = bundle.opportunities.filter(
    (row) =>
      row.openStatus &&
      !row.isStaffed &&
      candidateInScope(row.state, scope),
  ).length;

  const recruiters = liveRows.map((row) => {
    const candidatePipeline = pipelineByRecruiter.get(row.recruiter) ?? row.candidatesReviewed;
    const followUpPct = followUpCompletionPercent(row.recruiter, followUps);
    const hiringVelocity = hiresByRecruiter.get(row.recruiter) ?? row.hires;
    const coverageContribution =
      territoryOpenCalls > 0
        ? Math.round((candidatePipeline / territoryOpenCalls) * 100)
        : candidatePipeline > 0
          ? 100
          : 0;
    const score = compositeScore({
      candidatePipeline,
      followUpCompletionPercent: followUpPct,
      hiringVelocity,
      coverageContribution,
    });
    return {
      recruiter: row.recruiter,
      openReqs: openReqsByRecruiter.get(row.recruiter) ?? 0,
      candidatePipeline,
      followUpCompletionPercent: followUpPct,
      hiringVelocity,
      coverageContribution: Math.min(100, coverageContribution),
      performanceTier: performanceTier(score),
    };
  });

  recruiters.sort(
    (a, b) =>
      compositeScore(b) - compositeScore(a) || a.recruiter.localeCompare(b.recruiter),
  );

  const topPerformers = recruiters
    .filter((row) => row.performanceTier === "top")
    .slice(0, 3)
    .map((row) => row.recruiter);
  const needsSupport = recruiters
    .filter((row) => row.performanceTier === "needs-support")
    .slice(0, 3)
    .map((row) => row.recruiter);

  return { recruiters, topPerformers, needsSupport };
}

export function rankRecruitersByPerformance(
  recruiters: DmRecruiterPerformanceRow[],
): DmRecruiterPerformanceRow[] {
  return [...recruiters].sort((a, b) => {
    const tierRank: Record<DmRecruiterPerformanceTier, number> = {
      top: 0,
      average: 1,
      "needs-support": 2,
    };
    return (
      tierRank[a.performanceTier] - tierRank[b.performanceTier] ||
      b.coverageContribution - a.coverageContribution
    );
  });
}
