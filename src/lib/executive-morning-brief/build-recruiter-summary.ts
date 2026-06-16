import { buildRecruiterProductivitySnapshot } from "@/lib/recruiter-productivity-center";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { RecruiterPerformanceRow } from "@/lib/executive-morning-brief/types";

function pipelineHealth(score: number): RecruiterPerformanceRow["pipelineHealth"] {
  if (score >= 70) return "strong";
  if (score >= 45) return "moderate";
  return "weak";
}

function recruiterProductivityScore(row: {
  contactRatePercent: number | null;
  hireConversionPercent: number | null;
  assignedCount: number;
}): number {
  const contact = row.contactRatePercent ?? 0;
  const hire = row.hireConversionPercent ?? 0;
  const load = Math.min(100, row.assignedCount * 4);
  return Math.round(contact * 0.35 + hire * 0.45 + (100 - load) * 0.2);
}

export function buildRecruiterPerformanceSummary(
  bundle: RecruitingIntelligenceRouteBundle,
): {
  rows: RecruiterPerformanceRow[];
  topPerformers: RecruiterPerformanceRow[];
  needsAttention: RecruiterPerformanceRow[];
} {
  const productivity = buildRecruiterProductivitySnapshot({
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    filters: {},
  });

  const rows: RecruiterPerformanceRow[] = productivity.scorecards.map((row) => {
    const score = recruiterProductivityScore(row);
    return {
      recruiter: row.recruiter,
      openPositions: row.assignedCount,
      applicants: row.assignedCount,
      interviews: Math.round(row.assignedCount * ((row.contactRatePercent ?? 30) / 100)),
      placements: Math.round(row.assignedCount * ((row.hireConversionPercent ?? 10) / 100)),
      responseTimeHours: row.avgTimeToFirstContactHours,
      pipelineHealth: pipelineHealth(score),
      productivityScore: score,
    };
  });

  const sorted = [...rows].sort((a, b) => b.productivityScore - a.productivityScore);
  return {
    rows: sorted,
    topPerformers: sorted.slice(0, 3),
    needsAttention: [...sorted].reverse().slice(0, 3),
  };
}
