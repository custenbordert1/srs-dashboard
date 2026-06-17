import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildExecutiveRecruitingForecastSnapshot } from "@/lib/executive-recruiting-forecast";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRecruitingIntelligence } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import { buildRecruitingLiveSnapshot } from "@/lib/recruiting-live-snapshot";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive-recruiting-forecast";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "executive_recruiting_forecast_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const [liveSnapshot, melResult, workflows] = await Promise.all([
    buildRecruitingLiveSnapshot(),
    fetchMelProjectsSheet(),
    getCandidateWorkflowState(),
  ]);

  if (!liveSnapshot.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: liveSnapshot.error,
        partial: Boolean(liveSnapshot.fallback),
      },
      { status: liveSnapshot.fallback ? 200 : 503 },
    );
  }

  const jobs = applyTerritoryToJobs(session, liveSnapshot.jobs.jobs);
  const candidates = applyTerritoryToCandidates(session, liveSnapshot.candidates.candidates);
  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const fetchedAt = liveSnapshot.fetchedAt;
  const partialSync = liveSnapshot.syncStatus !== "ready" || (liveSnapshot.candidates.truncated ?? false);

  const intelligence = buildRecruitingIntelligence(session, jobs, candidates, fetchedAt, workflows);
  const snapshot = buildExecutiveRecruitingForecastSnapshot({
    jobs,
    candidates,
    workflows,
    opportunities,
    intelligence,
    fetchedAt,
    partialSync,
    breezyOk: true,
  });

  return NextResponse.json(
    {
      ok: true,
      snapshot,
      meta: {
        partialSync,
        melOk: melResult.ok,
        syncStatus: liveSnapshot.syncStatus,
        refreshedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    },
  );
}
