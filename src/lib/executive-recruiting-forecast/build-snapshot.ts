import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import { buildDmCapacityRows, buildRecruiterCapacityRows } from "@/lib/executive-recruiting-forecast/capacity-planning";
import {
  buildHiringForecastHorizons,
  buildWeeklyHireForecast,
} from "@/lib/executive-recruiting-forecast/hiring-forecast";
import { buildProjectCompletionRisks } from "@/lib/executive-recruiting-forecast/project-risk";
import { buildExecutiveForecastRecommendations } from "@/lib/executive-recruiting-forecast/recommendations";
import { buildTerritoryShortageForecast } from "@/lib/executive-recruiting-forecast/territory-shortage";
import type {
  DataTrustLevel,
  ExecutiveRecruitingForecastSnapshot,
} from "@/lib/executive-recruiting-forecast/types";

const FORECAST_ASSUMPTIONS = [
  "Hire velocity uses trailing 30-day Active Rep transitions from workflow history.",
  "Pipeline conversion weights: interview 12%, paperwork 22%, Ready for MEL 45%.",
  "Applicant flow extrapolates trailing 30-day applications scaled by published job count.",
  "Territory shortage compares open MEL opportunities to active reps plus 35% of pipeline depth.",
  "Capacity scores penalize recruiter backlog, open job pressure, and overdue follow-ups.",
  "Forecasts are deterministic — they do not call external AI services.",
];

function resolveDataTrust(partialSync: boolean, breezyOk: boolean): DataTrustLevel {
  if (!breezyOk) return "degraded";
  if (partialSync) return "partial";
  return "high";
}

export function buildExecutiveRecruitingForecastSnapshot(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  opportunities: MelOpportunity[];
  intelligence: RecruitingIntelligenceSnapshot;
  fetchedAt: string;
  partialSync?: boolean;
  breezyOk?: boolean;
}): ExecutiveRecruitingForecastSnapshot {
  const partialSync = input.partialSync ?? false;
  const breezyOk = input.breezyOk ?? true;
  const hiringForecasts = buildHiringForecastHorizons({
    candidates: input.candidates,
    workflows: input.workflows,
    publishedJobCount: input.jobs.length,
    fetchedAt: input.fetchedAt,
    partialSync,
  });
  const forecast90 = hiringForecasts.find((row) => row.horizonDays === 90)!;
  const pipelineBacklog = input.candidates.length;
  const weeklyHireForecast = buildWeeklyHireForecast({
    projectedHires90: forecast90.projectedHires,
    pipelineBacklog,
  });
  const recruiterCapacity = buildRecruiterCapacityRows({
    candidates: input.candidates,
    jobs: input.jobs,
    workflows: input.workflows,
    productivityRows: input.intelligence.productivity,
  });
  const dmCapacity = buildDmCapacityRows({
    candidates: input.candidates,
    workflows: input.workflows,
    opportunities: input.opportunities,
  });
  const territoryShortages = buildTerritoryShortageForecast({
    candidates: input.candidates,
    workflows: input.workflows,
    opportunities: input.opportunities,
  });
  const pipelineByProject = new Map<string, number>();
  for (const opp of input.opportunities) {
    const key = opp.projectNo || opp.projectName;
    pipelineByProject.set(key, (pipelineByProject.get(key) ?? 0));
  }
  for (const candidate of input.candidates) {
    const record = input.workflows[candidate.candidateId];
    if (!record?.assignedDM) continue;
    for (const opp of input.opportunities) {
      if (opp.territoryOwner === record.assignedDM || opp.state === candidate.state) {
        const key = opp.projectNo || opp.projectName;
        pipelineByProject.set(key, (pipelineByProject.get(key) ?? 0) + 1);
      }
    }
  }
  const projectCompletionRisks = buildProjectCompletionRisks({
    opportunities: input.opportunities,
    pipelineByProject,
  });
  const projectedApplicantShortage = Math.max(
    0,
    territoryShortages.reduce((sum, row) => sum + row.projectedShortage, 0) * 2 - forecast90.projectedApplicants,
  );
  const recommendations = buildExecutiveForecastRecommendations({
    territoryShortages,
    recruiterCapacity,
    dmCapacity,
    projectedApplicantShortage,
  });

  const forecast30 = hiringForecasts.find((row) => row.horizonDays === 30)!;
  const forecast60 = hiringForecasts.find((row) => row.horizonDays === 60)!;

  return {
    generatedAt: input.fetchedAt,
    dataTrust: resolveDataTrust(partialSync, breezyOk),
    assumptions: FORECAST_ASSUMPTIONS,
    partialSync,
    kpis: {
      projectedHires30: forecast30.projectedHires,
      projectedHires60: forecast60.projectedHires,
      projectedHires90: forecast90.projectedHires,
      projectedApplicants90: forecast90.projectedApplicants,
      overloadedRecruiters: recruiterCapacity.filter((row) => row.status === "overloaded").length,
      overloadedDms: dmCapacity.filter((row) => row.status === "overloaded").length,
      territoriesAtRisk: territoryShortages.filter((row) => row.likelyMissCoverage).length,
      projectsAtRisk: projectCompletionRisks.length,
    },
    hiringForecasts,
    weeklyHireForecast,
    recruiterCapacity,
    dmCapacity,
    territoryShortages: territoryShortages.slice(0, 15),
    projectCompletionRisks,
    recommendations,
  };
}
