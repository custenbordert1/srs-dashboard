import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { executeP168ExecutiveApproval } from "@/lib/p168-executive-approval/approval-engine";
import type { P168ApproveRequest } from "@/lib/p168-executive-approval/approval-types";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROUTE = "/api/recruiting/executive-approval/approve";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_executive_approval_approve",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  let body: P168ApproveRequest = { action: "dismiss", recommendationId: "" };
  try {
    body = (await request.json()) as P168ApproveRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "dismiss") {
    return NextResponse.json(
      { ok: false, error: "Invalid action. Use approve or dismiss." },
      { status: 400 },
    );
  }

  if (!body.recommendationId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "recommendationId is required." },
      { status: 400 },
    );
  }

  const result = await executeP168ExecutiveApproval({
    session,
    action: body.action,
    recommendationId: body.recommendationId.trim(),
  });

  return NextResponse.json({
    ok: result.ok,
    result,
    report: result.report,
  });
}
