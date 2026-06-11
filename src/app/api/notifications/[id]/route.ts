import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { updateNotificationOverlay } from "@/lib/notification-engine/notification-store";
import type { NotificationLifecycleStatus } from "@/lib/notification-engine/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "notification_update",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const { id } = await context.params;
  const sourceKey = decodeURIComponent(id);
  const body = (await request.json()) as { action?: "read" | "dismiss" | "resolve" };

  const status: NotificationLifecycleStatus =
    body.action === "dismiss"
      ? "dismissed"
      : body.action === "resolve"
        ? "resolved"
        : "read";

  const overlay = await updateNotificationOverlay(session, sourceKey, status);
  return NextResponse.json({ ok: true, overlay });
}
