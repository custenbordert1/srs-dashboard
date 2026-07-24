import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import {
  buildCandidateDetail,
  readP1863Flags,
} from "@/lib/p186-3-operator-lifecycle-queues";
import { workflowsToP1863Source } from "@/lib/p186-3-operator-lifecycle-queues/workflowAdapter";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/recruiting/p186-operator-queues/detail";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p186_operator_queues_detail",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1863Flags();
  if (!flags.operatorDashboard) {
    return NextResponse.json(
      { ok: false, error: "P186 operator dashboard flag is off" },
      { status: 403 },
    );
  }

  const candidateId = new URL(request.url).searchParams.get("candidateId")?.trim();
  if (!candidateId) {
    return NextResponse.json({ ok: false, error: "candidateId required" }, { status: 400 });
  }

  const bundle = await getCandidateWorkflowBundle();
  const workflows = workflowsToP1863Source(bundle.workflows);
  const detail = await buildCandidateDetail({ candidateId, workflows });
  if (!detail) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Never expose signing URLs / envelope ids
  const safe = {
    ...detail,
    selectionEvidence: detail.selectionEvidence.filter(
      (e) => !/sign|url|envelope|secret|token/i.test(e),
    ),
  };

  return NextResponse.json({ ok: true, detail: safe });
}
