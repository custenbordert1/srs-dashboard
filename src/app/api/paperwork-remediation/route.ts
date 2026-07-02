import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildPaperworkRemediationReport } from "@/lib/p134-paperwork-remediation-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/paperwork-remediation
 * P134 read-only remediation analysis for blocked paperwork candidates.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildPaperworkRemediationReport();

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    remediation: report,
    executivePanel: report.executivePanel,
    summary: report.summary,
    executeBatchCalled: false,
    breezyWrites: false,
    warnings: [
      "P134 — read-only remediation analysis.",
      "No production writes, no paperwork sends, no executeBatch.",
    ],
  });
}
