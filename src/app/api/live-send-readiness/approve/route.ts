import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { approveLiveSendReadiness } from "@/lib/live-send-readiness";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/live-send-readiness/approve
 * Record executive live-send readiness approval only — does not send paperwork.
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let body: {
    confirmationPhrase?: string;
    candidateCount?: number;
    dryRunReportTimestamp?: string;
    executiveApprovalFlag?: boolean;
    mtdOnly?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const confirmationPhrase = typeof body.confirmationPhrase === "string" ? body.confirmationPhrase : "";
  const candidateCount =
    typeof body.candidateCount === "number" && Number.isFinite(body.candidateCount)
      ? body.candidateCount
      : NaN;
  const dryRunReportTimestamp =
    typeof body.dryRunReportTimestamp === "string" ? body.dryRunReportTimestamp : "";

  if (!confirmationPhrase.trim()) {
    return NextResponse.json({ ok: false, error: "confirmationPhrase required." }, { status: 400 });
  }
  if (!Number.isFinite(candidateCount)) {
    return NextResponse.json({ ok: false, error: "candidateCount required." }, { status: 400 });
  }
  if (!dryRunReportTimestamp.trim()) {
    return NextResponse.json(
      { ok: false, error: "dryRunReportTimestamp required — use generatedAt from GET report." },
      { status: 400 },
    );
  }

  try {
    const result = await approveLiveSendReadiness({
      approvedBy: guard.session.name,
      approvedByUserId: guard.session.userId,
      confirmationPhrase,
      candidateCount,
      dryRunReportTimestamp,
      executiveApprovalFlag: body.executiveApprovalFlag === true,
      mtdOnly: body.mtdOnly !== false,
    });

    return NextResponse.json({
      ok: true,
      liveSend: false,
      approval: result.approval,
      readiness: result.report,
      warnings: result.warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Live-send readiness approval failed.",
      },
      { status: 400 },
    );
  }
}
