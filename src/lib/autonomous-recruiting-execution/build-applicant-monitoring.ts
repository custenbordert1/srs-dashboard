import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyJob } from "@/lib/breezy-api";
import type { TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";
import type { ApplicantPerformanceRow } from "@/lib/autonomous-recruiting-execution/types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";

const DEFAULT_TARGET_APPLICANTS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function territoryKeyForState(state: string): string {
  const normalized = normalizeStateCode(state);
  const dm = getDmForState(normalized) ?? "Unassigned";
  return `${dm}:${normalized}`;
}

function estimateTimeToFillDays(
  applicants: number,
  target: number,
  coverageStatus: TerritoryCoverageNeed["coverageStatus"],
): number | null {
  if (applicants >= target) return null;
  const gap = target - applicants;
  const baseDays = gap * 4;
  const multiplier =
    coverageStatus === "Critical" ? 1.5 : coverageStatus === "At Risk" ? 1.25 : 1;
  return Math.round(baseDays * multiplier);
}

export function buildApplicantMonitoring(input: {
  coverageNeeds: TerritoryCoverageNeed[];
  scoredRows: ScoredCandidateWorkflowRow[];
  jobs: BreezyJob[];
  fetchedAt: string;
}): ApplicantPerformanceRow[] {
  const rowsByTerritory = new Map<string, ApplicantPerformanceRow>();

  for (const coverage of input.coverageNeeds) {
    const targetApplicants = Math.max(DEFAULT_TARGET_APPLICANTS, coverage.openCalls);
    const alerts: string[] = [];

    if (coverage.applicantCount < targetApplicants) {
      alerts.push(`Applicants below target (${coverage.applicantCount}/${targetApplicants})`);
    }
    if (coverage.coverageStatus === "Critical") {
      alerts.push("Coverage status critical");
    }

    rowsByTerritory.set(coverage.territoryKey, {
      territoryKey: coverage.territoryKey,
      territoryLabel: coverage.territoryLabel,
      applicants: coverage.applicantCount,
      qualified: 0,
      interview: 0,
      readyForMel: 0,
      targetApplicants,
      timeToFillDays: estimateTimeToFillDays(
        coverage.applicantCount,
        targetApplicants,
        coverage.coverageStatus,
      ),
      alerts,
    });
  }

  for (const row of input.scoredRows) {
    const key = territoryKeyForState(row.state);
    const territory = rowsByTerritory.get(key);
    if (!territory) continue;

    if (row.workflowStatus === "Qualified" || row.recruitingActions.recommendInterview) {
      territory.qualified += 1;
    }
    if (/interview/i.test(row.workflowStatus) || row.recruitingActions.recommendInterview) {
      territory.interview += 1;
    }
    if (["Ready for MEL", "Loaded in MEL", "Active Rep"].includes(row.workflowStatus)) {
      territory.readyForMel += 1;
    }
  }

  const publishedJobs = input.jobs.filter((job) => job.status === "published");
  for (const job of publishedJobs) {
    const key = territoryKeyForState(job.state);
    const territory = rowsByTerritory.get(key);
    if (!territory) continue;
    if (territory.applicants === 0 && (job.candidateCount ?? 0) > 0) {
      territory.applicants = Math.max(territory.applicants, job.candidateCount ?? 0);
    }
  }

  const referenceMs = new Date(input.fetchedAt).getTime();
  return [...rowsByTerritory.values()].sort((a, b) => {
    const alertDiff = b.alerts.length - a.alerts.length;
    if (alertDiff !== 0) return alertDiff;
    return (a.timeToFillDays ?? MS_PER_DAY) - (b.timeToFillDays ?? MS_PER_DAY);
  });
}
