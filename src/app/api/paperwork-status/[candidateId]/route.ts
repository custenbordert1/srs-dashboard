import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getPaperworkStatusForCandidate } from "@/lib/paperwork-monitor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/paperwork-status/:candidateId */
export async function GET(
  request: Request,
  context: { params: Promise<{ candidateId: string }> },
) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const { candidateId } = await context.params;
  const status = await getPaperworkStatusForCandidate(candidateId);

  if (!status) {
    return NextResponse.json({ ok: false, error: "Candidate not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, paperworkStatus: status });
}
