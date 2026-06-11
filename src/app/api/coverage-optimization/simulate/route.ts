import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { simulateCoverageChange } from "@/lib/coverage-optimization";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "coverage_optimization_simulate",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const body = (await request.json()) as {
    addRepIds?: string[];
    removeRepIds?: string[];
    moveRep?: { repId: string; newState: string; newCity?: string };
  };

  const territoryStates = filterStatesForSession(session) ?? undefined;
  const [candidatesResult, melResult, activeReps] = await Promise.all([
    fetchBreezyCandidates({ scanMode: "fast" }),
    fetchMelProjectsSheet(),
    listActiveRosterReps(),
  ]);

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(session, candidatesResult.candidates)
    : [];
  const fetchedAt = candidatesResult.ok ? candidatesResult.fetchedAt : new Date().toISOString();
  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const territoryReps =
    territoryStates && territoryStates.length > 0
      ? activeReps.filter((rep) => territoryStates.includes(normalizeStateCode(rep.state)))
      : activeReps;

  const delta = simulateCoverageChange({
    opportunities,
    reps: territoryReps,
    candidates,
    fetchedAt,
    territoryStates,
    addRepIds: body.addRepIds,
    removeRepIds: body.removeRepIds,
    moveRep: body.moveRep,
  });

  return NextResponse.json({ ok: true, delta });
}
