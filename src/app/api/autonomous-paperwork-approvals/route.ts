import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildApprovalReport } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/autonomous-paperwork-approvals
 * Read-only approval brain — no sends.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildApprovalReport();

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    policy: report.policy,
    summary: report.summary,
    decisions: report.decisions,
    autoApproved: report.autoApproved,
    humanReview: report.humanReview,
    blocked: report.blocked,
    safetyRejected: report.safetyRejected,
    topCandidates: report.topCandidates,
    blockers: report.blockers,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
    warnings: [
      "P124 — read-only approval engine.",
      "P124 — only AUTO_APPROVED candidates may enter P123 send queue.",
      "P122/P123 safety gates still required before any live send.",
    ],
  });
}
