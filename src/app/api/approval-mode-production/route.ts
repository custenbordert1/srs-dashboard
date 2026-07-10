import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_P84_FEATURE_FLAGS, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import {
  buildApprovalModeProductionFromStores,
  executeApprovalModePersistence,
} from "@/lib/approval-mode-production";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/approval-mode-production
 * Approval-mode production queue and persistence status (P97).
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const mtdOnly = url.searchParams.get("mtdOnly") !== "false";
  const includeQueue = url.searchParams.get("includeQueue") === "true";

  const [report, p84Flags] = await Promise.all([
    buildApprovalModeProductionFromStores({ mtdOnly }),
    loadP84FeatureFlags(),
  ]);

  return NextResponse.json({
    ok: true,
    previewMode: false,
    liveSend: false,
    p84Flags: { ...p84Flags, liveSend: false },
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    production: includeQueue
      ? report
      : {
          ...report,
          queue: report.queue.map((entry) => ({
            candidateId: entry.candidateId,
            candidateName: entry.candidateName,
            status: entry.status,
            approvedBy: entry.approvedBy,
            p84EligibleAfterPersistence: entry.p84EligibleAfterPersistence,
          })),
        },
    warnings: [
      "Approval-mode production — persistence only via explicit POST with candidateIds.",
      "No auto-approval. No paperwork sends. No Breezy writes.",
      p84Flags.liveSend
        ? "WARNING: P84 liveSend enabled globally; P97 POST is blocked while liveSend is on."
        : "P84 liveSend disabled (expected).",
    ],
  });
}

/**
 * POST /api/approval-mode-production
 * Persist P62/DM/P83 workflow changes for explicitly approved candidate IDs.
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let body: { candidateIds?: string[]; mtdOnly?: boolean };
  try {
    body = (await request.json()) as { candidateIds?: string[]; mtdOnly?: boolean };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds : [];
  if (candidateIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "candidateIds required — no auto-approval." },
      { status: 400 },
    );
  }

  try {
    const result = await executeApprovalModePersistence({
      candidateIds,
      approvedBy: guard.session.name,
      approvedByUserId: guard.session.userId,
      mtdOnly: body.mtdOnly !== false,
    });

    return NextResponse.json({
      ok: true,
      liveSend: false,
      persisted: result.persisted,
      skipped: result.skipped,
      production: result.report,
      warnings: [
        "Persistence complete — no paperwork sent.",
        "Rollback artifacts written for each persisted candidate.",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Approval persistence failed.",
      },
      { status: 400 },
    );
  }
}
