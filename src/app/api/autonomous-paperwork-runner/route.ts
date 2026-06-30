import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildAutonomousPaperworkRunnerSnapshot,
  P106_1_DEFAULT_MODE,
} from "@/lib/autonomous-paperwork-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/autonomous-paperwork-runner
 * Runner status snapshot (no cycle execution).
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildAutonomousPaperworkRunnerSnapshot();

  return NextResponse.json({
    ok: true,
    defaultMode: P106_1_DEFAULT_MODE,
    autonomousPaperworkRunner: report,
    warnings: [
      "P106.1 default mode is dryRun — no sends.",
      "executeOne only — no executeBatch.",
      "No Breezy writes.",
    ],
  });
}
