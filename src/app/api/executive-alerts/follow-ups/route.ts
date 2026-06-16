import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { isRecruiterRole } from "@/lib/auth/roles";
import type { FollowUpOwnerKind, FollowUpPriority } from "@/lib/alerts/executive-alert-status-types";
import { isReEngagementAlertId } from "@/lib/candidate-re-engagement-intelligence/re-engagement-alert-id";
import { upsertExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_PRIORITIES = new Set<FollowUpPriority>(["critical", "high", "medium", "low"]);
const VALID_OWNER_KINDS = new Set<FollowUpOwnerKind>(["dm", "recruiter"]);

export async function POST(request: Request) {
  let body: {
    alertId?: string;
    ownerKind?: FollowUpOwnerKind;
    ownerName?: string;
    dueDate?: string;
    priority?: FollowUpPriority;
    notes?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const alertId = body.alertId?.trim() ?? "";
  const recruiterReEngagementOnly = isReEngagementAlertId(alertId);
  const guard = guardApiRoute(request, {
    allowedRoles: recruiterReEngagementOnly
      ? ["admin", "executive", "recruiter"]
      : ["admin", "executive"],
    requireTerritory: recruiterReEngagementOnly,
    auditAction: "executive_alerts_follow_up_assign",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  if (isRecruiterRole(session.role) && !recruiterReEngagementOnly) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const ownerName = body.ownerName?.trim();
  const dueDate = body.dueDate?.trim();
  if (
    !alertId ||
    !ownerName ||
    !dueDate ||
    !body.ownerKind ||
    !VALID_OWNER_KINDS.has(body.ownerKind) ||
    !body.priority ||
    !VALID_PRIORITIES.has(body.priority)
  ) {
    return NextResponse.json(
      { ok: false, error: "alertId, ownerKind, ownerName, dueDate, and priority are required" },
      { status: 400 },
    );
  }

  const result = await upsertExecutiveAlertFollowUp(session, {
    alertId,
    ownerKind: body.ownerKind,
    ownerName,
    dueDate,
    priority: body.priority,
    notes: body.notes,
  });

  return NextResponse.json({ ok: true, ...result });
}
