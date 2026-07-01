import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildProjectMappingReport,
  saveMappingReviewDecision,
  type MappingReviewAction,
} from "@/lib/p108-intelligent-project-mapping";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST /api/project-mapping/review — local review decision only; no Breezy writes */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as {
    candidateId?: string;
    sourcePositionId?: string;
    recommendedPositionId?: string | null;
    action?: MappingReviewAction;
    confidenceScore?: number;
  };

  if (!body.candidateId?.trim() || !body.sourcePositionId?.trim() || !body.action) {
    return NextResponse.json({ ok: false, error: "candidateId, sourcePositionId, and action required." }, { status: 400 });
  }

  if (!["approve", "reject", "skip"].includes(body.action)) {
    return NextResponse.json({ ok: false, error: "Invalid review action." }, { status: 400 });
  }

  const record = await saveMappingReviewDecision({
    candidateId: body.candidateId.trim(),
    sourcePositionId: body.sourcePositionId.trim(),
    recommendedPositionId: body.recommendedPositionId?.trim() || null,
    action: body.action,
    confidenceScore: body.confidenceScore ?? 0,
    decidedBy: guard.session.userId,
  });

  const report = await buildProjectMappingReport({ mode: "dryRun" });

  return NextResponse.json({
    ok: true,
    record,
    projectMapping: report,
    warnings: [
      "P108 review saved locally — no Breezy writes.",
      ...report.warnings,
    ],
  });
}
