import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { buildRepIntelligenceWithGeocoding } from "@/lib/rep-intelligence/build-rep-intelligence";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "coverage_risk_read",
  });
  if (isGuardFailure(guard)) return guard;

  const melResult = await fetchMelProjectsSheet();
  if (!melResult.ok) {
    return NextResponse.json({ ok: false, error: melResult.error }, { status: 503 });
  }

  const breezyResult = await fetchBreezyCandidates();
  const candidates = breezyResult.ok ? breezyResult.candidates : [];

  const territoryStates = filterStatesForSession(guard.session) ?? undefined;
  const repSnapshot = await buildRepIntelligenceWithGeocoding(
    melResult.rows,
    melResult.fetchedAt,
    territoryStates,
  );

  const opportunities = parseMelOpportunities(melResult.rows);
  const snapshot = buildCoverageRiskSnapshot({
    opportunities,
    reps: repSnapshot.activeReps,
    candidates,
    fetchedAt: melResult.fetchedAt,
    territoryStates,
  });

  return NextResponse.json(
    { ok: true, snapshot },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    },
  );
}
