import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import {
  buildP171LifecycleConsole,
  emptyP171LifecycleConsole,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/lifecycle-manager/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_lifecycle_manager_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const safe = await buildSafeApiResponse({
    label: "Lifecycle manager status",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const console = await buildP171LifecycleConsole();
      return { console, warnings: console.warnings };
    },
    fallback: () => ({
      console: emptyP171LifecycleConsole(),
      warnings: ["Degraded empty lifecycle console"],
    }),
    mapWarnings: (p) => p.warnings,
  });

  return NextResponse.json({
    ok: true,
    console: safe.payload.console,
    warnings: safe.warnings,
    meta: safe.meta,
  });
}
