import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildMelLoadDispatch } from "@/lib/workforce-ops-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "mel_pipeline_push",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const body = (await request.json()) as {
    candidateId?: string;
    opportunityId?: string;
    startDate?: string;
  };

  const candidateId = body.candidateId?.trim();
  if (!candidateId) {
    return NextResponse.json({ ok: false, error: "candidateId required" }, { status: 400 });
  }

  const candidatesResult = await fetchBreezyCandidates({ scanMode: "fast" });
  if (!candidatesResult.ok) {
    return NextResponse.json({ ok: false, error: candidatesResult.error }, { status: 503 });
  }

  const candidate = candidatesResult.candidates.find((row) => row.candidateId === candidateId);
  if (!candidate) {
    return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
  }

  const melResult = await fetchMelProjectsSheet();
  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const opportunity = opportunities.find((row) => row.opportunityId === body.opportunityId);

  const dispatch = buildMelLoadDispatch(candidate, {
    candidateId,
    opportunityId: body.opportunityId ?? opportunity?.opportunityId ?? null,
    territory: candidate.state,
    startDate: body.startDate,
  });

  const workflow = await upsertCandidateWorkflow({
    candidateId,
    workflowStatus: "Ready for MEL",
    note: "Queued for MEL load via workforce operations center",
    audit: { action: "mel_pipeline_push", byUserId: session.userId },
  });

  return NextResponse.json({
    ok: true,
    dispatch,
    workflow,
    matchedOpportunity: opportunity
      ? { opportunityId: opportunity.opportunityId, projectName: opportunity.projectName }
      : null,
  });
}
