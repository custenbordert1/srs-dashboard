import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { buildRepIntelligenceWithGeocoding } from "@/lib/rep-intelligence/build-rep-intelligence";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "rep_intelligence",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const melResult = await fetchMelProjectsSheet();
  if (!melResult.ok) {
    return NextResponse.json({ ok: false, error: melResult.error }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  const territoryStates = filterStatesForSession(session) ?? undefined;
  const snapshot = await buildRepIntelligenceWithGeocoding(
    melResult.rows,
    melResult.fetchedAt,
    territoryStates ?? undefined,
    { includeInactive },
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
