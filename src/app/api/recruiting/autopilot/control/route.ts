import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  executeP155AutopilotControl,
  type P155ControlAction,
} from "@/lib/p155-autopilot-operations-dashboard";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROUTE = "/api/recruiting/autopilot/control";

const ALLOWED_ACTIONS = new Set<P155ControlAction>([
  "dry_cycle",
  "live_cycle",
  "pause",
  "resume",
  "refresh",
]);

type PostBody = {
  action?: P155ControlAction;
  confirmLive?: boolean;
};

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autopilot_control",
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

  const url = new URL(request.url);
  const action = (body.action ?? url.searchParams.get("action")) as P155ControlAction | null;
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid action. Use dry_cycle, live_cycle, pause, resume, or refresh.",
      },
      { status: 400 },
    );
  }

  if (action === "live_cycle" && body.confirmLive !== true) {
    const confirmParam = url.searchParams.get("confirmLive");
    body.confirmLive = confirmParam === "true";
  }

  const result = await executeP155AutopilotControl({
    session,
    action,
    confirmLive: body.confirmLive,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
