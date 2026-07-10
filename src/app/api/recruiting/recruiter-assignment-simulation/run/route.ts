import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runAssignmentSimulation } from "@/lib/p158-assignment-simulation";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/recruiter-assignment-simulation/run";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_recruiter_assignment_simulation_run",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const maxRaw = new URL(request.url).searchParams.get("maxAssignments");
  const maxAssignments = maxRaw ? Number.parseInt(maxRaw, 10) : null;

  const result = await runAssignmentSimulation({
    maxAssignments: Number.isFinite(maxAssignments) && maxAssignments! > 0 ? maxAssignments : null,
  });

  return NextResponse.json(result);
}
