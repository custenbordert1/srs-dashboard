import { NextResponse } from "next/server";
import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runAutonomousRecruitingCycle } from "@/lib/autonomous-recruiting-pipeline";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROUTE = "/api/recruiting/autonomous-cycle";

/**
 * Executive-only P243 end-to-end autonomous cycle.
 * Defaults to dryRun=true (no Breezy/Dropbox writes).
 * Live requires confirmLive; canaryLimit defaults to 3 unless fullLive=true.
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "api_access",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  let body: {
    dryRun?: boolean;
    useLLMEnhancement?: boolean;
    limit?: number;
    positionIds?: string[];
    confirmLive?: boolean;
    canaryLimit?: number;
    fullLive?: boolean;
    preferWebhooks?: boolean;
    enableSmartPoll?: boolean;
    forceFreshReset?: boolean;
    /** @deprecated alias of forceFreshReset */
    forceFreshData?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const dryRun = body.dryRun !== false;
  if (!dryRun && body.confirmLive !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Live cycle requires confirmLive=true (and dryRun=false).",
      },
      { status: 400 },
    );
  }
  if (!dryRun && body.fullLive === true && body.confirmLive !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "fullLive requires confirmLive=true.",
      },
      { status: 400 },
    );
  }

  try {
    const report = await runAutonomousRecruitingCycle({
      dryRun,
      useLLMEnhancement: Boolean(body.useLLMEnhancement),
      limit: body.limit ?? 25,
      positionIds: body.positionIds,
      confirmLive: body.confirmLive,
      canaryLimit: body.canaryLimit ?? 3,
      fullLive: body.fullLive === true,
      preferWebhooks: body.preferWebhooks,
      enableSmartPoll: body.enableSmartPoll,
      forceFreshReset: body.forceFreshReset === true || body.forceFreshData === true,
      byUserId: session.userId,
    });
    return NextResponse.json({
      ok: true,
      report,
      summary: {
        mode: report.executionMode,
        dryRun: report.dryRun,
        pulled: report.pulled,
        scored: report.scored,
        autoAdvance: report.autoAdvance,
        humanReview: report.humanReview,
        paperworkPlanned: report.paperworkPlanned,
        paperworkSent: report.paperworkSent,
        failures: report.failures,
        successRatePct: report.successRatePct,
        advanceRatePct: report.advanceRatePct,
        freshResetApplied: report.freshResetApplied,
        warnings: report.warnings,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
