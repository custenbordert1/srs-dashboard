import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  executeP159OperationsControl,
  type P159ControlAction,
} from "@/lib/p159-operations-control-center";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROUTE = "/api/recruiting/operations-control-center/control";

const ALLOWED_ACTIONS = new Set<P159ControlAction>([
  "refresh",
  "dry_cycle",
  "live_cycle",
  "pause",
  "resume",
  "emergency_stop",
]);

type PostBody = {
  action?: P159ControlAction;
  confirmLive?: boolean;
};

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_operations_control_center_control",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  let body: PostBody = {};
  try {
    body = (await request.json()) as PostBody;
  } catch {
    body = {};
  }

  const action = body.action;
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid action. Use refresh, dry_cycle, live_cycle, pause, resume, or emergency_stop.",
      },
      { status: 400 },
    );
  }

  const result = await executeP159OperationsControl({
    session,
    action,
    confirmLive: body.confirmLive,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
