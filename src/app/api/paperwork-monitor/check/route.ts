import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getPaperworkStatusForCandidate, runPaperworkMonitorCycle } from "@/lib/paperwork-monitor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/paperwork-monitor/check — poll Dropbox for active packet(s). */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let candidateId: string | undefined;
  let dryRun = false;
  try {
    const body = (await request.json()) as { candidateId?: string; dryRun?: boolean };
    candidateId = body.candidateId;
    dryRun = body.dryRun === true;
  } catch {
    // check all
  }

  const result = await runPaperworkMonitorCycle({
    mode: dryRun ? "dryRun" : "runOnce",
    candidateIds: candidateId ? [candidateId] : undefined,
    byUserId: guard.session.userId,
  });

  const statuses = candidateId
    ? [await getPaperworkStatusForCandidate(candidateId)]
    : await Promise.all(
        result.report.candidates.map((c) => getPaperworkStatusForCandidate(c.candidateId)),
      );

  return NextResponse.json({
    ok: result.ok,
    skippedOverlap: result.skippedOverlap,
    statuses: statuses.filter(Boolean),
    paperworkMonitor: result.report,
    warnings: result.warnings,
  });
}
