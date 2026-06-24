import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runCandidateIngestionSync } from "@/lib/candidate-ingestion";
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

  const { searchParams } = new URL(request.url);
  const completeCycle = searchParams.get("complete") === "true";
  const referenceMtd = Number.parseInt(searchParams.get("reference_mtd") ?? "", 10);
  const runPipeline = searchParams.get("run_pipeline") !== "false";

  const result = await runCandidateIngestionSync({
    byUserId: session.userId,
    runPipeline,
    completeCycle,
    referenceBreezyMtd: Number.isFinite(referenceMtd) ? referenceMtd : undefined,
    maxRuntimeMs: completeCycle ? 115_000 : 110_000,
    maxPositionsPerChunk: completeCycle ? 25 : 20,
  });

  if (result.ok && result.positionsScannedThisRun > 0) {
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "candidate_ingestion_sync",
      metadata: {
        positionsScanned: result.positionsScannedThisRun,
        positionCoveragePct: result.positionCoveragePct,
        newCandidates: result.newCandidates,
        cycleComplete: result.cycleComplete,
      },
    });
  }

  return NextResponse.json(result);
}
