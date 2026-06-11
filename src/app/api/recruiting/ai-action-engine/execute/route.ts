import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { executeAiAction, executeAiActionBulk } from "@/lib/ai-action-engine";
import type { AiActionKind, AiActionPayload } from "@/lib/ai-action-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_KINDS = new Set<string>([
  "create-job-ad",
  "assign-recruiter",
  "create-dm-escalation",
  "send-follow-up",
  "push-candidate-mel",
  "generate-route-plan",
]);

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "ai_action_engine_execute",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const body = (await request.json()) as {
    bulk?: boolean;
    confirmed?: boolean;
    insightId?: string;
    recommendation?: string;
    actionKind?: string;
    payload?: AiActionPayload;
    actions?: Array<{
      insightId: string;
      recommendation: string;
      actionKind: string;
      payload?: AiActionPayload;
    }>;
  };

  if (!body.confirmed) {
    return NextResponse.json({ ok: false, error: "confirmed: true required" }, { status: 400 });
  }

  if (body.bulk && Array.isArray(body.actions)) {
    const actions = body.actions
      .filter((row) => VALID_KINDS.has(row.actionKind))
      .map((row) => ({
        insightId: row.insightId,
        recommendation: row.recommendation,
        actionKind: row.actionKind as AiActionKind,
        payload: row.payload ?? {},
      }));
    const results = await executeAiActionBulk({ actions, confirmed: true, session });
    return NextResponse.json({ ok: true, results });
  }

  const actionKind = body.actionKind ?? "";
  if (!body.insightId || !VALID_KINDS.has(actionKind)) {
    return NextResponse.json({ ok: false, error: "insightId and valid actionKind required" }, { status: 400 });
  }

  const result = await executeAiAction({
    insightId: body.insightId,
    recommendation: body.recommendation ?? body.insightId,
    actionKind: actionKind as AiActionKind,
    payload: body.payload ?? {},
    confirmed: true,
    session,
  });

  return NextResponse.json({ ok: result.ok, result });
}
