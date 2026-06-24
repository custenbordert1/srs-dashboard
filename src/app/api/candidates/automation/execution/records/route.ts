import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { listCandidateExecutions } from "@/lib/candidate-automation-execution";
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
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);

  const records = await listCandidateExecutions(Number.isFinite(limit) ? limit : 50);

  return NextResponse.json({
    ok: true,
    records,
    count: records.length,
  });
}
