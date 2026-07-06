import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  loadControlledPaperworkAutomationForSession,
  recordPaperworkApprovals,
  runAutoSendPaperworkReminders,
  type PaperworkApprovalAction,
} from "@/lib/p145-controlled-paperwork-automation/load-controlled-paperwork-automation";
import { isP146AutoSendEnabled } from "@/lib/recruiting/paperwork-execution-engine";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/paperwork-automation";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_paperwork_automation_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const url = new URL(request.url);
  const executionMode = url.searchParams.get("mode") === "approval" ? "approval" : "preview";

  const result = await loadControlledPaperworkAutomationForSession(session, { executionMode });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        partial: result.partial ?? false,
        snapshot: result.snapshot ?? null,
      },
      { status: result.partial ? 200 : 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      snapshot: result.snapshot,
      meta: result.meta,
      autoSendEnabled: isP146AutoSendEnabled(),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=45, stale-while-revalidate=90",
      },
    },
  );
}

type PostBody = {
  action?: PaperworkApprovalAction;
  candidateIds?: string[];
  dryRun?: boolean;
  snapshot?: NonNullable<
    Awaited<ReturnType<typeof loadControlledPaperworkAutomationForSession>> extends { ok: true; snapshot: infer S }
      ? S
      : never
  >;
};

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_paperwork_automation_approve",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.action) {
    return NextResponse.json({ ok: false, error: "action is required" }, { status: 400 });
  }

  if (body.action === "auto_send_reminders") {
    const dryRun = body.dryRun !== false;
    if (!dryRun && !isP146AutoSendEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          error: "P146_AUTO_SEND_PAPERWORK_REMINDERS_ENABLED is not true — live auto-send blocked.",
        },
        { status: 403 },
      );
    }

    const { summary, snapshot } = await runAutoSendPaperworkReminders({ session, dryRun });

    return NextResponse.json({
      ok: true,
      snapshot,
      execution: summary,
      autoSendEnabled: isP146AutoSendEnabled(),
      message: dryRun
        ? "Dry run complete — no reminders sent."
        : summary.sentCount > 0
          ? `Auto-sent ${summary.sentCount} reminder(s).`
          : "Auto-send completed with no sends.",
    });
  }

  if (!body.snapshot) {
    return NextResponse.json(
      { ok: false, error: "snapshot is required for approval actions" },
      { status: 400 },
    );
  }

  const snapshot = await recordPaperworkApprovals({
    session,
    action: body.action,
    candidateIds: body.candidateIds ?? [],
    snapshot: body.snapshot,
  });

  return NextResponse.json({
    ok: true,
    snapshot,
    message:
      "Approval recorded. Initial paperwork still requires recruiter approval — reminders use P146 auto-send when enabled.",
  });
}
