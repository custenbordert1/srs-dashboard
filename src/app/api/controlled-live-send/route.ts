import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import {
  buildControlledLiveSendReport,
  executeControlledLiveSend,
} from "@/lib/controlled-live-send";
import type { ControlledLiveSendMode } from "@/lib/controlled-live-send/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseMode(value: string | null | undefined): ControlledLiveSendMode {
  if (value === "executeOne" || value === "executeBatch") return value;
  return "dryRun";
}

/**
 * GET /api/controlled-live-send
 * Controlled live-send status and safety locks (default dryRun; no sends).
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
  const mode = parseMode(url.searchParams.get("mode"));

  const [report, p84Flags] = await Promise.all([
    buildControlledLiveSendReport({ mtdOnly, mode }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    defaultMode: "dryRun",
    controlledLiveSend: includeCandidates
      ? report
      : {
          ...report,
          candidates: report.candidates.map((entry) => ({
            candidateId: entry.candidateId,
            candidateName: entry.candidateName,
            status: entry.status,
            p84Eligible: entry.p84Eligible,
          })),
        },
    p84Flags,
    warnings: [
      "P100 controlled live send — default mode is dryRun (no sends).",
      "executeBatch requires P99 approval, liveSend enabled, and confirmation phrase.",
      "No Breezy writes.",
    ],
  });
}

/**
 * POST /api/controlled-live-send
 * Execute controlled live send in dryRun, executeOne, or executeBatch mode.
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let body: {
    mode?: ControlledLiveSendMode;
    executiveApprovalFlag?: boolean;
    confirmationPhrase?: string;
    candidateCount?: number;
    candidateId?: string;
    mtdOnly?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = body.mode ?? "dryRun";

  try {
    const result = await executeControlledLiveSend({
      mode,
      executiveApprovalFlag: body.executiveApprovalFlag,
      confirmationPhrase: body.confirmationPhrase,
      candidateCount: body.candidateCount,
      candidateId: body.candidateId,
      byUserId: guard.session.userId,
      mtdOnly: body.mtdOnly !== false,
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      stoppedEarly: result.stoppedEarly,
      stopReason: result.stopReason,
      executed: result.executed,
      controlledLiveSend: result.report,
      warnings: result.warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Controlled live send failed.",
      },
      { status: 400 },
    );
  }
}
