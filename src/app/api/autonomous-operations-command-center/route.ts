import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildOperationsCommandCenterReport,
  type OperationsFilter,
  type OperationsTimeRange,
} from "@/lib/p126-autonomous-operations-command-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseTimeRange(value: string | null): OperationsTimeRange {
  if (value === "yesterday" || value === "last7days" || value === "lastHour" || value === "all") {
    return value;
  }
  return "today";
}

/**
 * GET /api/autonomous-operations-command-center
 * P126 read-only operations command center for autonomous paperwork.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const filters: OperationsFilter = {
    timeRange: parseTimeRange(url.searchParams.get("timeRange")),
    candidateQuery: url.searchParams.get("candidate") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    approvalDecision: url.searchParams.get("approvalDecision") ?? undefined,
    failureReason: url.searchParams.get("failureReason") ?? undefined,
    errorsOnly: url.searchParams.get("errorsOnly") === "true",
  };
  const refresh = url.searchParams.get("refresh") === "true";

  const report = await buildOperationsCommandCenterReport({ filters, refresh });

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    runner: report.runner,
    queue: report.queue,
    timeline: report.timeline,
    metrics: report.metrics,
    health: report.health,
    candidateSummary: report.candidateSummary,
    failures: report.failures,
    retries: report.retries,
    diagnostics: report.diagnostics,
    filters: report.filters,
    operationsCommandCenter: report,
    executeBatchCalled: false,
    warnings: [
      "P126 — read-only operations command center.",
      "Runner controls delegate to P125 APIs — no bypass paths.",
      "executeOne only — executeBatch never used.",
    ],
  });
}
