import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { listCandidateAutomationRuns } from "@/lib/candidate-automation-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "20", 10);

  const runs = await listCandidateAutomationRuns(Number.isFinite(limit) ? limit : 20);

  return NextResponse.json({
    ok: true,
    runs,
    count: runs.length,
  });
}
