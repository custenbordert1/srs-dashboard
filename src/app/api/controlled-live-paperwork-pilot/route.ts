import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildControlledLivePaperworkPilotReport } from "@/lib/p122-controlled-live-paperwork-pilot";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/controlled-live-paperwork-pilot
 * Preview-only pilot status — no sends.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildControlledLivePaperworkPilotReport({ dryRun: true });

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    controlledLivePaperworkPilot: report,
    warnings: report.warnings,
  });
}
