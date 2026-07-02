import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildPaperworkRemediationExecutorReport } from "@/lib/p135-paperwork-remediation-executor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/paperwork-remediation-executor
 * P135 read-only executor status and latest preview summary.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const maxCandidates = Number(url.searchParams.get("maxCandidates") ?? "15") || 15;

  const report = await buildPaperworkRemediationExecutorReport({
    previewOnly: true,
    maxCandidates,
    tierFilter: [1, 2],
  });

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    executor: report,
    executivePanel: report.executivePanel,
    summary: report.summary,
    executeBatchCalled: false,
    breezyWrites: false,
    warnings: [
      "P135 — preview-only remediation executor.",
      "Safe actions run locally in memory — no Breezy writes, no paperwork sends.",
    ],
  });
}
