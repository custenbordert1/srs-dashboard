import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildProductionRunnerSnapshot } from "@/lib/p125-autonomous-paperwork-production-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/autonomous-paperwork-runner
 * P125 production runner status — read-only snapshot.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const snapshot = await buildProductionRunnerSnapshot();

  return NextResponse.json({
    ok: true,
    previewOnly: !snapshot.state.continuousEnabled,
    autonomousPaperworkRunner: snapshot,
    liveStatus: snapshot.status,
    metrics: snapshot.metrics,
    queue: snapshot.queue,
    failures: snapshot.failures,
    retries: snapshot.retries,
    uptimeMs: snapshot.metrics.uptimeMs,
    warnings: [
      "P125 — production runner via P123 orchestrator + P124 approval + P122 executeOne.",
      "P125 — executeBatch is never used.",
      "Live send requires P122 pilot gates and explicit live env flags.",
    ],
  });
}
