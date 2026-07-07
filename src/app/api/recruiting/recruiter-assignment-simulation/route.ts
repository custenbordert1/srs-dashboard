import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAssignmentSimulation } from "@/lib/p158-assignment-simulation";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/recruiter-assignment-simulation";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_recruiter_assignment_simulation",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const maxRaw = new URL(request.url).searchParams.get("maxAssignments");
  const maxAssignments = maxRaw ? Number.parseInt(maxRaw, 10) : null;

  const simulation = await buildAssignmentSimulation({
    maxAssignments: Number.isFinite(maxAssignments) && maxAssignments! > 0 ? maxAssignments : null,
  });

  return NextResponse.json({
    ok: true,
    readOnly: true,
    simulationOnly: true,
    simulation,
    warnings: simulation.warnings,
  });
}
