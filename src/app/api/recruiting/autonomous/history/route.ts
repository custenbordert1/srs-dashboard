import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadOrchestratorRunHistory } from "@/lib/p148-autonomous-recruiting-orchestrator/orchestrator-store";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/autonomous/history";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autonomous_history_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const history = await loadOrchestratorRunHistory();

  return NextResponse.json(
    {
      ok: true,
      runs: history.slice(0, limit),
      total: history.length,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    },
  );
}
