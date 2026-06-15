import { listActiveRosterReps } from "@/lib/active-rep-store";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRecruitingIntelligenceMetrics } from "@/lib/recruiting-intelligence/build-recruiting-intelligence-metrics";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

export async function buildRecruitingIntelligenceSnapshot(): Promise<RecruitingIntelligenceSnapshot> {
  const builtAt = new Date().toISOString();

  const [jobsResult, candidatesResult, workflows, melResult, activeReps] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates({ scanMode: "fast" }),
    getCandidateWorkflowState(),
    fetchMelProjectsSheet(),
    listActiveRosterReps(),
  ]);

  const fetchedAt = candidatesResult.ok
    ? candidatesResult.fetchedAt
    : jobsResult.ok
      ? jobsResult.fetchedAt
      : builtAt;

  const melOk = melResult.ok;
  const opportunities = melOk ? parseMelOpportunities(melResult.rows) : [];

  const globalCoverage =
    jobsResult.ok && candidatesResult.ok
      ? buildCoverageRiskSnapshot({
          opportunities,
          reps: activeReps,
          candidates: candidatesResult.candidates,
          fetchedAt,
          territoryStates: undefined,
        })
      : null;

  const metrics = buildRecruitingIntelligenceMetrics({
    jobsResult,
    candidatesResult,
    workflows,
    opportunities,
    activeReps,
    melOk,
    globalCoverage,
  });

  return {
    fetchedAt,
    builtAt,
    jobsResult,
    candidatesResult,
    workflows,
    melResult,
    opportunities,
    activeReps,
    melOk,
    globalCoverage,
    metrics,
  };
}
