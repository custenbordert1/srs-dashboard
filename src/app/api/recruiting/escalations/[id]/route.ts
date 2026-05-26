import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  appendRecruiterEscalationNote,
  canTransitionEscalationStatus,
  getRecruiterEscalation,
  updateRecruiterEscalationStatus,
} from "@/lib/operational-escalation/operational-escalation-store";
import type { RecruiterEscalationQueueStatus } from "@/lib/operational-escalation/operational-escalation-types";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const STATUSES = new Set<RecruiterEscalationQueueStatus>([
  "new",
  "in_review",
  "completed",
  "dismissed",
]);

type PatchBody = {
  status?: RecruiterEscalationQueueStatus;
  note?: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    auditAction: "recruiter_escalation_update",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const { id } = await context.params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const existing = await getRecruiterEscalation(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Escalation not found." }, { status: 404 });
  }

  let item = existing;

  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
    }
    if (!canTransitionEscalationStatus(existing.status, body.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot transition status ${existing.status} → ${body.status}.`,
        },
        { status: 400 },
      );
    }
    const updated = await updateRecruiterEscalationStatus(id, body.status, session);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Status update failed." }, { status: 400 });
    }
    item = updated;
  }

  if (body.note !== undefined && body.note.trim()) {
    const withNote = await appendRecruiterEscalationNote(id, body.note, session);
    if (!withNote) {
      return NextResponse.json({ ok: false, error: "Note could not be saved." }, { status: 400 });
    }
    item = withNote;
  }

  auditFromSession(session, {
    action: "api_access",
    entityType: "system",
    entityId: id,
    metadata: {
      action: "recruiter_escalation_update",
      status: body.status,
      hasNote: Boolean(body.note?.trim()),
    },
  });

  return NextResponse.json({ ok: true, item });
}
