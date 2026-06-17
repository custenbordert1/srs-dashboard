import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildExecutiveRecruitingForecastSnapshot } from "@/lib/executive-recruiting-forecast";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRecruitingIntelligence } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import { buildRecruitingLiveSnapshot } from "@/lib/recruiting-live-snapshot";

export type ExecutiveForecastLoadResult =
  | {
      ok: true;
      forecast: ReturnType<typeof buildExecutiveRecruitingForecastSnapshot>;
      workflows: Awaited<ReturnType<typeof getCandidateWorkflowState>>;
      partialSync: boolean;
      melOk: boolean;
      syncStatus: string;
    }
  | {
      ok: false;
      error: string;
      partial?: boolean;
    };

export async function loadExecutiveRecruitingForecastForSession(
  session: AuthSession,
): Promise<ExecutiveForecastLoadResult> {
  const [liveSnapshot, melResult, workflows] = await Promise.all([
    buildRecruitingLiveSnapshot(),
    fetchMelProjectsSheet(),
    getCandidateWorkflowState(),
  ]);

  if (!liveSnapshot.ok) {
    return {
      ok: false,
      error: liveSnapshot.error,
      partial: Boolean(liveSnapshot.fallback),
    };
  }

  const jobs = applyTerritoryToJobs(session, liveSnapshot.jobs.jobs);
  const candidates = applyTerritoryToCandidates(session, liveSnapshot.candidates.candidates);
  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const fetchedAt = liveSnapshot.fetchedAt;
  const partialSync = liveSnapshot.syncStatus !== "ready" || (liveSnapshot.candidates.truncated ?? false);

  const intelligence = buildRecruitingIntelligence(session, jobs, candidates, fetchedAt, workflows);
  const forecast = buildExecutiveRecruitingForecastSnapshot({
    jobs,
    candidates,
    workflows,
    opportunities,
    intelligence,
    fetchedAt,
    partialSync,
    breezyOk: true,
  });

  return {
    ok: true,
    forecast,
    workflows,
    partialSync,
    melOk: melResult.ok,
    syncStatus: liveSnapshot.syncStatus,
  };
}
