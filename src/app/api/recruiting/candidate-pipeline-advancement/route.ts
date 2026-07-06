import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  advanceCandidatePipeline,
  isP151AutonomousAdvancementEnabled,
} from "@/lib/p151-autonomous-candidate-advancement";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/candidate-pipeline-advancement";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_candidate_pipeline_advancement_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const report = await advanceCandidatePipeline({ session, dryRun: true });

  return NextResponse.json(
    {
      ok: true,
      report,
      meta: {
        p151Enabled: isP151AutonomousAdvancementEnabled(),
        dryRun: true,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=45, stale-while-revalidate=90",
      },
    },
  );
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_candidate_pipeline_advancement_execute",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  if (!isP151AutonomousAdvancementEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "P151_AUTONOMOUS_ADVANCEMENT_ENABLED is not true — live advancement blocked.",
      },
      { status: 403 },
    );
  }

  const report = await advanceCandidatePipeline({ session, dryRun: false, userId: session.userId });

  return NextResponse.json({
    ok: report.failures === 0 && !report.stoppedOnError,
    report,
    meta: {
      p151Enabled: true,
      dryRun: false,
    },
  });
}
