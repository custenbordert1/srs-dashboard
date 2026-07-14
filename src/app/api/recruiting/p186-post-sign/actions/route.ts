import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  canPerformP1865Action,
  executePostSignReviewAction,
  readP1865Flags,
  toP1865ProductRole,
  type P1865OperatorAction,
} from "@/lib/p186-5-post-sign-mel-queue";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/p186-post-sign/actions";

type Body = {
  action: P1865OperatorAction;
  candidateId: string;
  note?: string;
  jobOrProjectId?: string;
  onboardingAssignmentId?: string;
  investigationOwner?: string;
};

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p186_post_sign_actions",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1865Flags();
  if (!flags.postSignHealthDashboard && !flags.onboardingReviewActions && !flags.readyForMelReviewActions) {
    return NextResponse.json(
      { ok: false, error: "P186.5 review action flags are off" },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const role = toP1865ProductRole(guard.session.role, true);
  if (!canPerformP1865Action(role, body.action)) {
    return NextResponse.json(
      { ok: false, error: `Role ${role} cannot perform ${body.action}` },
      { status: 403 },
    );
  }
  if (!body.candidateId?.trim()) {
    return NextResponse.json({ ok: false, error: "candidateId required" }, { status: 400 });
  }

  const result = await executePostSignReviewAction({
    action: body.action,
    candidateId: body.candidateId.trim(),
    actor: guard.session.userId,
    role,
    note: body.note,
    jobOrProjectId: body.jobOrProjectId,
    onboardingAssignmentId: body.onboardingAssignmentId,
    investigationOwner: body.investigationOwner,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
