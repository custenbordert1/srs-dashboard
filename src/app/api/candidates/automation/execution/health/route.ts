import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildCandidateExecutionHealth } from "@/lib/candidate-automation-execution";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const health = await buildCandidateExecutionHealth();

  return NextResponse.json({
    ok: true,
    health,
  });
}
