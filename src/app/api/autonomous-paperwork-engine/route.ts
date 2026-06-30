import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildAutonomousPaperworkReport,
  P106_DEFAULT_MODE,
} from "@/lib/p106-autonomous-paperwork-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/autonomous-paperwork-engine
 * Autonomous paperwork engine status (default dryRun; no sends).
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const mtdOnly = url.searchParams.get("mtdOnly") !== "false";
  const includeCandidates = url.searchParams.get("includeCandidates") === "true";

  const report = await buildAutonomousPaperworkReport({ mtdOnly, mode: P106_DEFAULT_MODE });

  return NextResponse.json({
    ok: true,
    defaultMode: P106_DEFAULT_MODE,
    autonomousPaperworkEngine: includeCandidates
      ? report
      : {
          ...report,
          candidates: report.candidates.map((c) => ({
            candidateId: c.candidateId,
            candidateName: c.candidateName,
            category: c.category,
            blockerCategory: c.blockerCategory,
          })),
        },
    warnings: [
      "P106 default mode is dryRun — no sends.",
      "executeSafeSingles uses executeOne only — no executeBatch.",
      "No Breezy writes.",
    ],
  });
}
