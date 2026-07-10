import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  isAutonomousRecruitingEnabled,
  runAutonomousRecruitingCycle,
} from "@/lib/recruiting/autonomous-recruiting-orchestrator";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/autonomous/run";

type PostBody = {
  dryRun?: boolean;
};

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autonomous_run",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  let body: PostBody = {};
  try {
    body = (await request.json()) as PostBody;
  } catch {
    body = {};
  }

  const url = new URL(request.url);
  const dryRunParam = url.searchParams.get("dryRun");
  const orchestratorEnabled = isAutonomousRecruitingEnabled();
  const explicitLive = body.dryRun === false || dryRunParam === "false";
  const dryRun = !orchestratorEnabled || !explicitLive;

  const result = await runAutonomousRecruitingCycle({ session, dryRun });

  return NextResponse.json({
    ok: true,
    result,
    enabled: isAutonomousRecruitingEnabled(),
    message: result.skipped
      ? "Skipped overlapping run."
      : dryRun
        ? "Dry run complete."
        : "Orchestrator cycle complete.",
  });
}
