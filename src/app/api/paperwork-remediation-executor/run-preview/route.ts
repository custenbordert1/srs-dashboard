import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runRemediationExecutorPreview } from "@/lib/p135-paperwork-remediation-executor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/paperwork-remediation-executor/run-preview
 * P135 preview remediation run — no production writes.
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let maxCandidates = 30;
  let tierFilter: Array<1 | 2 | 3> = [1, 2];
  try {
    const body = (await request.json().catch(() => ({}))) as {
      maxCandidates?: number;
      tierFilter?: Array<1 | 2 | 3>;
    };
    if (typeof body.maxCandidates === "number" && body.maxCandidates > 0) {
      maxCandidates = Math.min(body.maxCandidates, 50);
    }
    if (Array.isArray(body.tierFilter) && body.tierFilter.length > 0) {
      tierFilter = body.tierFilter;
    }
  } catch {
    // use defaults
  }

  const report = await runRemediationExecutorPreview({ maxCandidates, tierFilter });

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    executor: report,
    executivePanel: report.executivePanel,
    summary: report.summary,
    humanTaskQueue: report.humanTaskQueue.slice(0, 50),
    executeBatchCalled: false,
    breezyWrites: false,
    warnings: [
      "P135 run-preview — no production writes.",
      "Manual Breezy actions queued in humanTaskQueue.",
    ],
  });
}
