import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  runP171LifecycleCycle,
  updateP171Config,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/lifecycle-manager/control";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_lifecycle_manager_control",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  let body: {
    action?: "pause" | "resume" | "run_cycle" | "update_config";
    force?: boolean;
    config?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action ?? "run_cycle";

  if (action === "pause") {
    const config = await updateP171Config({
      paused: true,
      pauseSchedule: { pausedUntil: null, reason: "Paused from lifecycle console" },
    });
    return NextResponse.json({ ok: true, action, config });
  }

  if (action === "resume") {
    const config = await updateP171Config({
      paused: false,
      pauseSchedule: { pausedUntil: null, reason: null },
    });
    return NextResponse.json({ ok: true, action, config });
  }

  if (action === "update_config" && body.config) {
    const config = await updateP171Config(body.config as Parameters<typeof updateP171Config>[0]);
    return NextResponse.json({ ok: true, action, config });
  }

  const result = await runP171LifecycleCycle({
    session: guard.session,
    force: body.force === true,
  });

  return NextResponse.json({
    ok: result.ok,
    action: "run_cycle",
    cycle: result.cycle,
    warnings: result.warnings,
  });
}
