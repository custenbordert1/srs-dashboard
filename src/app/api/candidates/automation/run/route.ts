import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runCandidateAutomationEngine } from "@/lib/candidate-automation-engine";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const result = await runCandidateAutomationEngine({
    trigger: "api",
    byUserId: session.userId,
  });

  if (result.ok && !result.skipped) {
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "candidate_automation_run",
      metadata: {
        runId: result.runId,
        mtdCandidatesProcessed: result.mtdCandidatesProcessed,
        p62CoveragePct: result.p62CoveragePct,
        p63CoveragePct: result.p63CoveragePct,
        p64CoveragePct: result.p64CoveragePct,
      },
    });
  }

  return NextResponse.json(result);
}
