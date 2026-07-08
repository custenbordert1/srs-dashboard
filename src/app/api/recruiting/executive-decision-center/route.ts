import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { buildP1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center";
import { emptyP1681DecisionCenterView } from "@/lib/p168.1-executive-decision-center/empty-view";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/executive-decision-center";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_executive_decision_center",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const safe = await buildSafeApiResponse({
    label: "Executive decision center",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const view = await buildP1681ExecutiveDecisionCenterView();
      return { view, warnings: view.warnings };
    },
    fallback: () => ({
      view: emptyP1681DecisionCenterView(),
      warnings: ["Degraded empty decision center view"],
    }),
    mapWarnings: (p) => p.warnings,
  });

  return NextResponse.json({
    ok: true,
    view: safe.payload.view,
    warnings: safe.warnings,
    meta: safe.meta,
  });
}
