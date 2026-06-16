import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
import {
  listExecutiveAlertActionLogs,
  listExecutiveAlertFollowUps,
  listExecutiveAlertStatusOverlays,
} from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import { buildUnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/unified-recruiting-command-center";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "unified_recruiting_command_center_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const timer = new ExecutiveRouteTimer(ROUTE);
  return respondExecutiveIntelligenceRoute({
    route: ROUTE,
    session,
    request,
    timer,
    bundleOptions: { unscopedForAdmin: true, scopeRepsToTerritory: false },
    build: async ({ bundle, deferExpensive }) => {
      const followUps = await listExecutiveAlertFollowUps();
      const statusOverlays = await listExecutiveAlertStatusOverlays(session.userId);
      const actionLogs = await listExecutiveAlertActionLogs();
      const assigneeOptions = buildExecutiveAlertAssigneeOptions(bundle);
      const snapshot = buildUnifiedRecruitingCommandCenterSnapshot({
        bundle,
        followUps,
        statusOverlays,
        actionLogs,
        deferExpensive,
      });
      return {
        snapshot,
        responseExtras: { assigneeOptions },
        logExtras: {
          workQueueCount: snapshot.workQueue.length,
          criticalTerritories: snapshot.kpis.criticalTerritories,
          phase: "command_center",
          deferred: deferExpensive,
        },
      };
    },
  });
}
