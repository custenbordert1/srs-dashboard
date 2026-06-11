import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { canAccessTerritory } from "@/lib/auth/permissions";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import {
  DM_ESCALATION_ACTION_LABELS,
  type DmEscalationActionType,
} from "@/lib/dm-dashboard/dm-operational-types";
import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";
import { toDmEscalationPublic } from "@/lib/operational-escalation/dm-escalation-response";
import {
  createRecruiterEscalation,
  listDmEscalationsForUser,
} from "@/lib/operational-escalation/operational-escalation-store";
import { RECRUITER_ESCALATION_STATUS_LABELS } from "@/lib/operational-escalation/operational-escalation-types";
import type { OperationalEscalationType } from "@/lib/operational-escalation/operational-escalation-types";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ESCALATION_TYPES = new Set<string>(Object.keys(DM_ESCALATION_ACTION_LABELS));

function isEscalationType(value: string): value is OperationalEscalationType {
  return ESCALATION_TYPES.has(value);
}

type CreateBody = {
  sourceEscalationLogId?: string;
  escalationType?: DmEscalationActionType;
  relatedJobId?: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  priority?: DmAlertPriority | null;
  priorityScore?: number | null;
  recommendedAction?: string;
  alertReason?: string;
  jobAgeDays?: number | null;
};

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["dm", "admin", "executive"],
    requireTerritory: true,
    auditAction: "dm_escalation_list",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, "/api/dm/escalations");

  const dmUserId = session.userId;
  const items = await listDmEscalationsForUser(dmUserId);

  return NextResponse.json(
    {
      ok: true,
      items: items.map(toDmEscalationPublic),
      statusLabels: RECRUITER_ESCALATION_STATUS_LABELS,
      refreshedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    },
  );
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["dm", "admin", "executive"],
    requireTerritory: true,
    auditAction: "dm_escalation_create",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, "/api/dm/escalations");

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const escalationType = body.escalationType?.trim() ?? "";
  const relatedJobId = body.relatedJobId?.trim() ?? "";
  const jobTitle = body.jobTitle?.trim() ?? "";
  const city = body.city?.trim() ?? "";
  const state = normalizeStateCode(body.state?.trim() ?? "");
  const sourceEscalationLogId = body.sourceEscalationLogId?.trim();

  if (!isEscalationType(escalationType)) {
    return NextResponse.json({ ok: false, error: "Invalid escalation type." }, { status: 400 });
  }
  if (!relatedJobId || !jobTitle || !state) {
    return NextResponse.json(
      { ok: false, error: "relatedJobId, jobTitle, and state are required." },
      { status: 400 },
    );
  }
  if (!canAccessTerritory(session, state)) {
    return NextResponse.json(
      { ok: false, error: "Job state is outside your assigned territory." },
      { status: 403 },
    );
  }

  const territory = session.territoryStates.join(", ") || state;
  const item = await createRecruiterEscalation(
    {
      escalationType,
      dmName: session.name,
      dmUserId: session.userId,
      territory,
      territoryStates: session.territoryStates,
      state,
      city,
      relatedJobId,
      jobTitle,
      priority: body.priority ?? null,
      priorityScore: body.priorityScore ?? null,
      recommendedAction: body.recommendedAction,
      alertReason: body.alertReason ?? DM_ESCALATION_ACTION_LABELS[escalationType],
      jobAgeDays: body.jobAgeDays ?? null,
      sourceEscalationLogId,
    },
    session,
  );

  auditFromSession(session, {
    action: "api_access",
    entityType: "system",
    entityId: item.id,
    metadata: {
      action: "dm_escalation_create",
      escalationType,
      relatedJobId,
      state,
    },
  });

  return NextResponse.json({ ok: true, item: toDmEscalationPublic(item) });
}
