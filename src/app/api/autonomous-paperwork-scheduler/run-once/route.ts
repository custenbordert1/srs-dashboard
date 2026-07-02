import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildAutonomousPaperworkSchedulerReport,
  runSchedulerCycle,
} from "@/lib/p136-autonomous-paperwork-scheduler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let maxRemediationCandidates = 15;
  try {
    const body = (await request.json().catch(() => ({}))) as { maxRemediationCandidates?: number };
    if (typeof body.maxRemediationCandidates === "number") {
      maxRemediationCandidates = Math.min(body.maxRemediationCandidates, 30);
    }
  } catch {
    // defaults
  }

  const cycle = await runSchedulerCycle({ mode: "oneCycle", maxRemediationCandidates });
  const report = await buildAutonomousPaperworkSchedulerReport({ lastCycle: cycle });

  return NextResponse.json({
    ok: cycle.error == null,
    previewOnly: true,
    cycle,
    scheduler: report,
    executivePanel: report.executivePanel,
    executeBatchCalled: false,
    breezyWrites: false,
    warnings: ["P136 run-once — preview-only cycle, no production writes."],
  });
}
