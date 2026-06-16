import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { saveExecutiveAlertNote } from "@/lib/alerts/executive-alert-status-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "executive_alerts_note_save",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: { alertId?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const alertId = body.alertId?.trim();
  const note = body.note?.trim() ?? "";
  if (!alertId) {
    return NextResponse.json({ ok: false, error: "alertId is required" }, { status: 400 });
  }

  const result = await saveExecutiveAlertNote(session, alertId, note);
  return NextResponse.json({ ok: true, ...result });
}
