import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type {
  BreezyCandidatesResult,
  BreezyJobsResult,
} from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { RecruitingIntelligenceMetrics } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

export function buildRecruitingIntelligenceMetrics(input: {
  jobsResult: BreezyJobsResult;
  candidatesResult: BreezyCandidatesResult;
  workflows: CandidateWorkflowState;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  melOk: boolean;
  globalCoverage: CoverageRiskSnapshot | null;
}): RecruitingIntelligenceMetrics {
  const jobCount = input.jobsResult.ok ? input.jobsResult.jobs.length : 0;
  const candidateCount = input.candidatesResult.ok ? input.candidatesResult.candidates.length : 0;

  return {
    jobCount,
    candidateCount,
    workflowCount: Object.keys(input.workflows).length,
    opportunityCount: input.opportunities.length,
    activeRepCount: input.activeReps.filter((rep) => rep.active).length,
    openCalls: input.globalCoverage?.executiveSummary.totalOpenOpportunities ?? 0,
    avgCoveragePercent: input.globalCoverage?.executiveSummary.averageCoverageScore ?? 0,
    criticalOpportunities: input.globalCoverage?.executiveSummary.highRiskProjectCount ?? 0,
    partialCandidateSync: input.candidatesResult.ok ? Boolean(input.candidatesResult.partial) : false,
    melAvailable: input.melOk,
  };
}
