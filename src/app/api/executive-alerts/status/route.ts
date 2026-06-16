import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { isRecruiterRole } from "@/lib/auth/roles";
import type { ExecutiveAlertStatus } from "@/lib/alerts/executive-alert-status-types";
import { isReEngagementAlertId } from "@/lib/candidate-re-engagement-intelligence/re-engagement-alert-id";
import {
  listExecutiveAlertActionLogs,
  listExecutiveAlertFollowUps,
  listExecutiveAlertStatusOverlays,
  upsertExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<ExecutiveAlertStatus>([
  "new",
  "in-review",
  "snoozed",
  "resolved",
]);

export async function PATCH(request: Request) {
  let body: {
    alertId?: string;
    status?: ExecutiveAlertStatus;
    snoozedUntil?: string | null;
    note?: string;
    previousStatus?: ExecutiveAlertStatus;
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
    auditAction: "executive_alerts_status_update",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  if (isRecruiterRole(session.role) && !recruiterReEngagementOnly) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const status = body.status;
  if (!alertId || !status || !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { ok: false, error: "alertId and valid status are required" },
      { status: 400 },
    );
  }

  const overlay = await upsertExecutiveAlertStatusOverlay(session, alertId, status, {
    snoozedUntil: body.snoozedUntil,
    note: body.note,
    previousStatus: body.previousStatus,
  });

  const actionLogs = await listExecutiveAlertActionLogs(alertId);

  return NextResponse.json({ ok: true, overlay, actionLogs });
}
