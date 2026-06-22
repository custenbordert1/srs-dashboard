import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadPipelineIntelligenceForSession } from "@/lib/pipeline-intelligence/load-pipeline-intelligence-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/pipeline-intelligence";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "pipeline_intelligence_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const result = await loadPipelineIntelligenceForSession(session);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, partial: result.partial ?? false },
      { status: result.partial ? 200 : 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      snapshot: result.snapshot,
      meta: {
        partialSync: result.partialSync,
        totalCandidates: result.totalCandidates,
        refreshedAt: result.snapshot.generatedAt,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
