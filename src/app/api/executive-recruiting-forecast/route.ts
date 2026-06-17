import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadExecutiveRecruitingForecastForSession } from "@/lib/executive-recruiting-forecast/load-forecast-context";
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

  const forecastResult = await loadExecutiveRecruitingForecastForSession(session);
  if (!forecastResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: forecastResult.error,
        partial: forecastResult.partial,
      },
      { status: forecastResult.partial ? 200 : 503 },
    );
  }

  const snapshot = forecastResult.forecast;

  return NextResponse.json(
    {
      ok: true,
      snapshot,
      meta: {
        partialSync: forecastResult.partialSync,
        melOk: forecastResult.melOk,
        syncStatus: forecastResult.syncStatus,
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
