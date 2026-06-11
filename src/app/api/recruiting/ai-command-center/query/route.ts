import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import {
  answerExecutiveQuestion,
  buildAiCommandCenterSnapshot,
} from "@/lib/ai-recruiting-command-center";
import { buildRecruitingCommandCenter } from "@/lib/recruiting-command-center";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "ai_command_center_query",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const body = (await request.json()) as { question?: string };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ ok: false, error: "question required" }, { status: 400 });
  }

  const territoryStates = filterStatesForSession(session) ?? undefined;

  const [jobsResult, candidatesResult, workflows, melResult, activeReps] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates({ scanMode: "fast" }),
    getCandidateWorkflowState(),
    fetchMelProjectsSheet(),
    listActiveRosterReps(),
  ]);

  if (!jobsResult.ok) {
    return NextResponse.json(breezyFailureBody(jobsResult), {
      status: breezyFailureHttpStatus(jobsResult.error),
    });
  }
  if (!candidatesResult.ok) {
    return NextResponse.json(breezyFailureBody(candidatesResult), {
      status: breezyFailureHttpStatus(candidatesResult.error),
    });
  }

  const jobs = applyTerritoryToJobs(session, jobsResult.jobs);
  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;
  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const territoryReps =
    territoryStates && territoryStates.length > 0
      ? activeReps.filter((rep) => territoryStates.includes(normalizeStateCode(rep.state)))
      : activeReps;

  const coverage = buildCoverageRiskSnapshot({
    opportunities,
    reps: territoryReps,
    candidates,
    fetchedAt,
    territoryStates,
  });

  const snapshot = buildAiCommandCenterSnapshot({
    jobs,
    candidates,
    workflows,
    opportunities,
    activeReps: territoryReps,
    coverage: melResult.ok ? coverage : null,
    fetchedAt,
    territoryStates,
    commandCenter: buildRecruitingCommandCenter(
      { ...candidatesResult, candidates },
      { ...jobsResult, jobs },
    ),
  });

  const answer = answerExecutiveQuestion(question, snapshot);
  return NextResponse.json({ ok: true, answer, snapshot });
}
