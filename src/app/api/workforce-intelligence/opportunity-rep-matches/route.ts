import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { listImportedReps } from "@/lib/active-rep-store";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { rankRepsForOpportunities } from "@/lib/workforce-intelligence/best-rep-matcher";
import { buildRepIntelligenceWithGeocoding } from "@/lib/rep-intelligence/build-rep-intelligence";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;

  let body: { opportunityIds?: string[] };
  try {
    body = (await request.json()) as { opportunityIds?: string[] };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const ids = Array.isArray(body.opportunityIds) ? body.opportunityIds.filter(Boolean).slice(0, 12) : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, matches: [] });
  }

  const melResult = await fetchMelProjectsSheet();
  if (!melResult.ok) {
    return NextResponse.json({ ok: false, error: melResult.error }, { status: 503 });
  }

  const territoryStates = filterStatesForSession(guard.session) ?? undefined;
  const allOpportunities = parseMelOpportunities(melResult.rows);
  const idSet = new Set(ids);
  const opportunities = allOpportunities.filter((o) => idSet.has(o.opportunityId));

  let reps = await listImportedReps();
  if (reps.length === 0) {
    const snapshot = await buildRepIntelligenceWithGeocoding(
      melResult.rows,
      melResult.fetchedAt,
      territoryStates ?? undefined,
    );
    reps = snapshot.activeReps;
  }

  if (territoryStates && territoryStates.length > 0) {
    reps = reps.filter((r) => territoryStates.includes(r.state));
  }

  const matches = rankRepsForOpportunities(reps, opportunities, {
    territoryStates: territoryStates ?? undefined,
    limitPerOpportunity: 3,
  });

  return NextResponse.json({ ok: true, matches });
}
