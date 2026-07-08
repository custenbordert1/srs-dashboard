import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getMetricsSnapshot } from "@/lib/app-performance/performance-metrics";
import { getCachedSnapshot } from "@/lib/app-performance/snapshot-cache";
import { isRefreshing } from "@/lib/app-performance/background-refresh";
import { getDropboxSignApiMetricsSnapshot } from "@/lib/dropbox-sign-api";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ROUTE = "/api/recruiting/app-performance";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_app_performance",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const cached = await getCachedSnapshot();
  const metrics = getMetricsSnapshot();

  return NextResponse.json({
    ok: true,
    metrics,
    dropboxApiMetrics: getDropboxSignApiMetricsSnapshot(),
    snapshot: cached.snapshot
      ? {
          origin: cached.snapshot.origin,
          generatedAt: cached.snapshot.generatedAt,
          ageMs: cached.ageMs,
          freshness: cached.freshness,
          buildDurationMs: cached.snapshot.buildDurationMs,
        }
      : null,
    refreshing: isRefreshing(),
  });
}
