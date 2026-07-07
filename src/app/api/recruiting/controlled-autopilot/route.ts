import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  executeControlledProductionAutopilot,
  isP154ControlledProductionAutopilotEnabled,
  loadAutopilotState,
} from "@/lib/p154-controlled-production-autopilot-activation";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROUTE = "/api/recruiting/controlled-autopilot";

type PostBody = {
  dryRun?: boolean;
};

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_controlled_autopilot_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const state = await loadAutopilotState();
  return NextResponse.json({
    ok: true,
    enabled: isP154ControlledProductionAutopilotEnabled(),
    state,
    dashboard: state.dashboard,
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_controlled_autopilot_run",
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
  const dryRunParam = url.searchParams.get("dryRun");
  const enabled = isP154ControlledProductionAutopilotEnabled();
  const explicitLive = body.dryRun === false || dryRunParam === "false";
  const dryRun = !enabled || !explicitLive;

  const report = await executeControlledProductionAutopilot({ session, dryRun });
  const state = await loadAutopilotState();

  return NextResponse.json({
    ok: report.health.healthy && report.cycle.failures === 0,
    report,
    state,
    message: report.paused
      ? `Autopilot paused: ${report.pausedReason}`
      : dryRun
        ? "Dry-run cycle complete."
        : "Controlled production cycle complete.",
  });
}
