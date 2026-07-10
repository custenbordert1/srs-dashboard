import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildProjectMappingReport } from "@/lib/p108-intelligent-project-mapping";
import type { MappingDecision, MappingReviewAction } from "@/lib/p108-intelligent-project-mapping/types";
import {
  buildReviewWorkflowReport,
  p109DecisionFromAction,
  P109_DEFAULT_MODE,
  saveP109ReviewDecision,
} from "@/lib/p109-project-mapping-review";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/project-mapping/review — P109 review workflow (local .data only) */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildReviewWorkflowReport();

  return NextResponse.json({
    ok: true,
    defaultMode: P109_DEFAULT_MODE,
    reviewWorkflow: report,
    warnings: report.warnings,
  });
}

/** POST /api/project-mapping/review — persist local review decision only; no Breezy writes */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as {
    candidateId?: string;
    candidateName?: string;
    sourcePositionId?: string;
    closedPositionId?: string;
    recommendedPositionId?: string | null;
    action?: MappingReviewAction;
    confidenceScore?: number;
    notes?: string;
    mappingReasons?: string[];
    mappingDecision?: MappingDecision;
    factorScores?: Array<{
      factor: string;
      points: number;
      maxPoints: number;
      matched: boolean;
      detail: string;
    }>;
  };

  const closedPositionId = (body.closedPositionId ?? body.sourcePositionId)?.trim();
  if (!body.candidateId?.trim() || !closedPositionId || !body.action) {
    return NextResponse.json(
      { ok: false, error: "candidateId, closedPositionId, and action required." },
      { status: 400 },
    );
  }

  if (!["approve", "reject", "skip"].includes(body.action)) {
    return NextResponse.json({ ok: false, error: "Invalid review action." }, { status: 400 });
  }

  const record = await saveP109ReviewDecision({
    candidateId: body.candidateId.trim(),
    candidateName: body.candidateName?.trim() || "Unknown",
    closedPositionId,
    recommendedPositionId: body.recommendedPositionId?.trim() || null,
    decision: p109DecisionFromAction(body.action),
    reviewer: guard.session.userId,
    notes: body.notes,
    confidenceScore: body.confidenceScore ?? 0,
    mappingReasons: body.mappingReasons ?? [],
    mappingDecision: body.mappingDecision ?? "REVIEW",
    factorScores: body.factorScores ?? [],
  });

  const [reviewWorkflow, projectMapping] = await Promise.all([
    buildReviewWorkflowReport(),
    buildProjectMappingReport({ mode: "dryRun" }),
  ]);

  return NextResponse.json({
    ok: true,
    record,
    reviewWorkflow,
    projectMapping,
    warnings: [
      "P109 review saved locally — no Breezy writes.",
      "P109 — no live sends or automatic paperwork.",
      ...reviewWorkflow.warnings,
    ],
  });
}
