import { guardApiRoute, isGuardFailure, auditTerritoryAccess } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildAutopilotSnapshot } from "@/lib/autonomous-recruiting-engine";
import { listApprovalRules } from "@/lib/autonomous-recruiting-engine/approval-rules-store";
import {
  buildExecutionSnapshot,
  listCorrelations,
} from "@/lib/autonomous-recruiting-execution";
import { loadRecommendationFeedbackIndex } from "@/lib/autonomous-recruiting-autopilot/recommendation-feedback-store";
import { buildControlCenterSnapshot, listAutomationRuns } from "@/lib/hiring-automation-engine";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildPlacementCommandCenterSnapshot } from "@/lib/placement-command-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/placement-command-center";

async function loadPlacementContext(session: AuthSession) {
  const [candidatesResult, jobsResult, workflows, melResult, runs, approvalRules, correlations] =
    await Promise.all([
      fetchBreezyCandidates(),
      fetchBreezyJobs("published"),
      getCandidateWorkflowState(),
      fetchMelProjectsSheet(),
      listAutomationRuns(),
      listApprovalRules(),
      listCorrelations(),
    ]);

  if (!candidatesResult.ok) {
    return { error: candidatesResult.error } as const;
  }

  const territoryStates = filterStatesForSession(session) ?? undefined;
  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const fetchedAt = melResult.ok ? melResult.fetchedAt : new Date().toISOString();

  const scoredRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );

  const feedbackIndex = await loadRecommendationFeedbackIndex();

  const autopilotSnapshot = buildAutopilotSnapshot({
    jobs,
    candidates,
    workflows,
    opportunities,
    scoredRows,
    fetchedAt,
    territoryStates,
    approvalRules,
    automationRuns: buildControlCenterSnapshot(runs),
    feedbackIndex,
  });

  const executionSnapshot = await buildExecutionSnapshot({
    autopilotSnapshot,
    jobs,
    scoredRows,
  });

  const snapshot = buildPlacementCommandCenterSnapshot({
    autopilotSnapshot,
    scoredRows,
    correlations,
    applicantPerformance: executionSnapshot.applicantPerformance,
    opportunities,
    territoryStates,
    fetchedAt,
  });

  return { snapshot, correlations: correlations.length };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "placement_command_center_read",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const startedAt = Date.now();
  const result = await loadPlacementContext(guard.session);
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json(
    {
      ok: true,
      snapshot: result.snapshot,
      meta: {
        correlationCount: result.correlations,
        refreshedAt: result.snapshot.fetchedAt,
        durationMs: Date.now() - startedAt,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
