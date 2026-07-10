import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  degradedP1547RunnerStatus,
  emptyP155Dashboard,
} from "@/lib/app-loading-reliability/api-fallbacks";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { buildP155OperationsDashboard } from "@/lib/p155-autopilot-operations-dashboard";
import { buildP1547AutopilotStatus } from "@/lib/p154-continuous-autonomous-recruiting-runner";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/autopilot/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autopilot_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const safe = await buildSafeApiResponse({
    label: "Autopilot status",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const [runner, built] = await Promise.all([
        buildP1547AutopilotStatus(),
        buildP155OperationsDashboard(),
      ]);
      return { runner, dashboard: built.dashboard, warnings: built.warnings };
    },
    fallback: async () => {
      const runner = await degradedP1547RunnerStatus();
      return { runner, dashboard: emptyP155Dashboard(), warnings: ["Degraded autopilot status snapshot"] };
    },
    mapWarnings: (p) => p.warnings,
  });

  return NextResponse.json({
    ok: safe.payload.runner.ok,
    runner: safe.payload.runner,
    dashboard: safe.payload.dashboard,
    warnings: safe.warnings,
    meta: safe.meta,
  });
}
