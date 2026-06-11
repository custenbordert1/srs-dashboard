import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { roleHasPermission } from "@/lib/production-readiness";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import {
  buildProductionReadinessSnapshot,
  withServerCache,
  SERVER_CACHE_DEFAULT_TTL_MS,
} from "@/lib/production-readiness";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    requireTerritory: false,
    auditAction: "production_readiness_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  if (!roleHasPermission(session.role, "system_admin")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const snapshot = await withServerCache(
    `production-readiness:${session.userId}`,
    SERVER_CACHE_DEFAULT_TTL_MS,
    async () => {
      const syncFailures: string[] = [];
      const [jobsResult, candidatesResult, workflows, melResult] = await Promise.all([
        fetchBreezyJobs("published"),
        fetchBreezyCandidates({ scanMode: "fast" }),
        getCandidateWorkflowState(),
        fetchMelProjectsSheet(),
      ]);

      if (!jobsResult.ok) syncFailures.push(jobsResult.error);
      if (!candidatesResult.ok) syncFailures.push(candidatesResult.error);
      if (!melResult.ok) syncFailures.push(melResult.error);

      const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
      const candidates = candidatesResult.ok
        ? applyTerritoryToCandidates(session, candidatesResult.candidates)
        : [];
      const fetchedAt = candidatesResult.ok ? candidatesResult.fetchedAt : new Date().toISOString();
      const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];

      return buildProductionReadinessSnapshot({
        jobs,
        candidates,
        workflows,
        opportunities,
        syncFailures,
        fetchedAt,
      });
    },
  );

  return NextResponse.json({ ok: true, snapshot });
}
