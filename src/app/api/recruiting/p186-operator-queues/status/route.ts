import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import {
  buildOperatorDashboard,
  readP1863Flags,
  toProductRole,
  type P1863DashboardSnapshot,
} from "@/lib/p186-3-operator-lifecycle-queues";
import { workflowsToP1863Source } from "@/lib/p186-3-operator-lifecycle-queues/workflowAdapter";
import { P186_3_SOURCE_PHASE } from "@/lib/p186-3-operator-lifecycle-queues/types";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/p186-operator-queues/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p186_operator_queues_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1863Flags();
  if (!flags.operatorDashboard) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      message: "P186 operator dashboard flag is off (observe-only module idle)",
      flags,
      sourcePhase: P186_3_SOURCE_PHASE,
    });
  }

  const url = new URL(request.url);
  const preferOperator = url.searchParams.get("asOperator") === "1";
  const role = toProductRole(guard.session.role, preferOperator);

  const safe = await buildSafeApiResponse({
    label: "P186 operator queues",
    timeoutMs: 90_000,
    build: async () => {
      const bundle = await getCandidateWorkflowBundle();
      const workflows = workflowsToP1863Source(bundle.workflows);
      const dashboard = await buildOperatorDashboard({
        role,
        workflows,
        filters: {
          queueId: url.searchParams.get("queueId"),
          recruiter: url.searchParams.get("recruiter"),
          dm: url.searchParams.get("dm"),
          search: url.searchParams.get("q"),
          productionState: url.searchParams.get("productionState"),
          lifecycleState: url.searchParams.get("lifecycleState"),
          priority: (url.searchParams.get("priority") as "high" | "medium" | "low" | null) || null,
          mismatchType: url.searchParams.get("mismatchType"),
          paperworkState: url.searchParams.get("paperworkState"),
          onboardingState: url.searchParams.get("onboardingState"),
          melReady:
            url.searchParams.get("melReady") == null
              ? null
              : url.searchParams.get("melReady") === "1",
        },
      });
      return { dashboard, warnings: [] as string[] };
    },
    fallback: () => ({
      dashboard: {
        sourcePhase: P186_3_SOURCE_PHASE,
        generatedAt: new Date().toISOString(),
        readOnlyDefault: true as const,
        flags,
        role,
        allowedActions: ["view", "filter_sort"],
        queues: [],
        items: [],
        health: {
          queueCounts: {},
          approvalAgingMs: { oldest: null, average: null },
          bulkActionSuccessRate: null,
          blockedActionCount: 0,
          lifecycleMismatchCount: 0,
          missingShadowCount: 0,
          eventIngestionLagMs: null,
          productionWriteFailures: 0,
          shadowUpdateLagMs: null,
          p184P185IsolationStatus: "isolated" as const,
        },
        isolation: {
          p184P185Untouched: true as const,
          paperworkSendDisabled: true as const,
          continuousAutomationDisabled: true as const,
          p186NonAuthoritative: true as const,
        },
      } satisfies P1863DashboardSnapshot,
      warnings: ["P186 operator dashboard degraded"],
    }),
    mapWarnings: (p) => p.warnings,
  });

  return NextResponse.json({
    ok: true,
    enabled: true,
    dashboard: safe.payload.dashboard,
    warnings: safe.warnings,
    meta: safe.meta,
  });
}
