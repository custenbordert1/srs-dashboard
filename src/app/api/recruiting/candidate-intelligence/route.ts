import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadCandidateAdvancementIntelligenceForSession } from "@/lib/p144-candidate-advancement-intelligence/load-candidate-advancement-intelligence";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/candidate-intelligence";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_candidate_intelligence_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const result = await loadCandidateAdvancementIntelligenceForSession(session);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        partial: result.partial ?? false,
        snapshot: result.snapshot ?? null,
      },
      { status: result.partial ? 200 : 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      snapshot: result.snapshot,
      meta: result.meta,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=45, stale-while-revalidate=90",
      },
    },
  );
}
