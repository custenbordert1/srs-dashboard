import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildAutonomousPaperworkRunnerSnapshot,
  runAutonomousPaperworkRunnerCycle,
} from "@/lib/autonomous-paperwork-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/p1061-autonomous-paperwork-runner
 * Legacy P106.1 runner snapshot.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildAutonomousPaperworkRunnerSnapshot();
  return NextResponse.json({ ok: true, autonomousPaperworkRunner: report });
}
