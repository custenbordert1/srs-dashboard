import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  isP158AutomaticAssignmentsEnabled,
  isP158WorkflowTransitionEnabled,
  runP158AssignmentCycle,
} from "@/lib/p158-autonomous-recruiter-assignment";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/recruiter-assignments/run";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_recruiter_assignments_run",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const url = new URL(request.url);
  const confirmAssignment =
    url.searchParams.get("confirmAssignment") === "true" ||
    url.searchParams.get("confirmAssignment") === "1";
  const confirmTransition =
    url.searchParams.get("confirmTransition") === "true" ||
    url.searchParams.get("confirmTransition") === "1";
  const transitionAfterAssignment =
    url.searchParams.get("transitionAfterAssignment") === "true" ||
    url.searchParams.get("transitionAfterAssignment") === "1";
  const allowOverwrite =
    url.searchParams.get("allowOverwrite") === "true" ||
    url.searchParams.get("allowOverwrite") === "1";

  if (confirmAssignment && !isP158AutomaticAssignmentsEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Production assignments blocked — set P158_AUTOMATIC_ASSIGNMENTS_ENABLED=true on the server.",
      },
      { status: 403 },
    );
  }

  if (confirmTransition && !isP158WorkflowTransitionEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Production transition blocked — set P158_WORKFLOW_TRANSITION_ENABLED=true on the server.",
      },
      { status: 403 },
    );
  }

  const result = await runP158AssignmentCycle({
    session: guard.session,
    confirmAssignment,
    confirmTransition,
    allowOverwrite,
    transitionAfterAssignment,
  });

  return NextResponse.json(result);
}
