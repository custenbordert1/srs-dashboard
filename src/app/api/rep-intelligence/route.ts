import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { buildRepIntelligenceSnapshot } from "@/lib/rep-intelligence/rep-engine";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "rep_intelligence",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const melResult = await fetchMelProjectsSheet();
  if (!melResult.ok) {
    return NextResponse.json({ ok: false, error: melResult.error }, { status: 503 });
  }

  const territoryStates = filterStatesForSession(session) ?? undefined;
  const snapshot = buildRepIntelligenceSnapshot(
    melResult.rows,
    melResult.fetchedAt,
    territoryStates ?? undefined,
  );

  return NextResponse.json(
    { ok: true, snapshot },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    },
  );
}
