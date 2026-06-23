import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import type { AuthSession } from "@/lib/auth/types";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  buildAutopilotSnapshot,
  evaluateApprovalRules,
  listApprovalRules,
  recordRuleTrigger,
  saveApprovalRules,
} from "@/lib/autonomous-recruiting-engine";
import type { ApprovalRule } from "@/lib/autonomous-recruiting-engine/types";
import {
  approveCorrelationWithAccountability,
  buildExecutionSnapshot,
  executeCorrelation,
  planCorrelationsFromSnapshot,
} from "@/lib/autonomous-recruiting-execution";
import { buildControlCenterSnapshot, listAutomationRuns } from "@/lib/hiring-automation-engine";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function loadSnapshotContext(session: AuthSession) {
  const [candidatesResult, jobsResult, workflows, melResult, runs, approvalRules] =
    await Promise.all([
      fetchBreezyCandidates(),
      fetchBreezyJobs("published"),
      getCandidateWorkflowState(),
      fetchMelProjectsSheet(),
      listAutomationRuns(),
      listApprovalRules(),
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

  return {
    candidates,
    jobs,
    workflows,
    opportunities,
    scoredRows,
    fetchedAt,
    territoryStates,
    approvalRules,
    automationRuns: buildControlCenterSnapshot(runs),
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "autonomous_recruiting_read",
  });
  if (isGuardFailure(guard)) return guard;

  const ctx = await loadSnapshotContext(guard.session);
  if ("error" in ctx) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: 502 });
  }

  const startedAt = Date.now();

  const snapshot = buildAutopilotSnapshot({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    workflows: ctx.workflows,
    opportunities: ctx.opportunities,
    scoredRows: ctx.scoredRows,
    fetchedAt: ctx.fetchedAt,
    territoryStates: ctx.territoryStates,
    approvalRules: ctx.approvalRules,
    automationRuns: ctx.automationRuns,
  });

  const executionSnapshot = await buildExecutionSnapshot({
    autopilotSnapshot: snapshot,
    jobs: ctx.jobs,
    scoredRows: ctx.scoredRows,
  });

  const buildMs = Date.now() - startedAt;

  return NextResponse.json(
    {
      ok: true,
      snapshot,
      executionSnapshot,
      meta: {
        buildMs,
        candidateCount: ctx.candidates.length,
        hiringRecommendationCounts: snapshot.hiringRecommendations.reduce(
          (counts, row) => {
            counts[row.recommendedAction] = (counts[row.recommendedAction] ?? 0) + 1;
            return counts;
          },
          {} as Record<string, number>,
        ),
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    },
  );
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "autonomous_recruiting_write",
  });
  if (isGuardFailure(guard)) return guard;

  const { session } = guard;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    rules?: ApprovalRule[];
    executionId?: string;
  };

  const actor = session.userId;

  if (body.action === "refresh-rules" && Array.isArray(body.rules)) {
    const saved = await saveApprovalRules(body.rules);
    return NextResponse.json({ ok: true, rules: saved });
  }

  async function respondWithExecutionSnapshot() {
    const ctx = await loadSnapshotContext(session);
    if ("error" in ctx) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: 502 });
    }

    const snapshot = buildAutopilotSnapshot({
      jobs: ctx.jobs,
      candidates: ctx.candidates,
      workflows: ctx.workflows,
      opportunities: ctx.opportunities,
      scoredRows: ctx.scoredRows,
      fetchedAt: ctx.fetchedAt,
      territoryStates: ctx.territoryStates,
      approvalRules: ctx.approvalRules,
      automationRuns: ctx.automationRuns,
    });

    const executionSnapshot = await buildExecutionSnapshot({
      autopilotSnapshot: snapshot,
      jobs: ctx.jobs,
      scoredRows: ctx.scoredRows,
    });

    return NextResponse.json({ ok: true, snapshot, executionSnapshot });
  }

  if (body.action === "plan-executions") {
    const ctx = await loadSnapshotContext(session);
    if ("error" in ctx) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: 502 });
    }

    const snapshot = buildAutopilotSnapshot({
      jobs: ctx.jobs,
      candidates: ctx.candidates,
      workflows: ctx.workflows,
      opportunities: ctx.opportunities,
      scoredRows: ctx.scoredRows,
      fetchedAt: ctx.fetchedAt,
      territoryStates: ctx.territoryStates,
      approvalRules: ctx.approvalRules,
      automationRuns: ctx.automationRuns,
    });

    await planCorrelationsFromSnapshot(snapshot);
    return respondWithExecutionSnapshot();
  }

  if (body.action === "approve-execution" && body.executionId) {
    const approved = await approveCorrelationWithAccountability(body.executionId, {
      displayName: actor,
    });
    if (!approved) {
      return NextResponse.json({ ok: false, error: "Execution cannot be approved." }, { status: 400 });
    }
    return respondWithExecutionSnapshot();
  }

  if (body.action === "execute-execution" && body.executionId) {
    const result = await executeCorrelation(body.executionId, actor);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, correlation: result.correlation },
        { status: 400 },
      );
    }
    return respondWithExecutionSnapshot();
  }

  if (body.action === "evaluate-rules") {
    const ctx = await loadSnapshotContext(session);
    if ("error" in ctx) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: 502 });
    }

    const baseSnapshot = buildAutopilotSnapshot({
      jobs: ctx.jobs,
      candidates: ctx.candidates,
      workflows: ctx.workflows,
      opportunities: ctx.opportunities,
      scoredRows: ctx.scoredRows,
      fetchedAt: ctx.fetchedAt,
      territoryStates: ctx.territoryStates,
      approvalRules: ctx.approvalRules,
      automationRuns: ctx.automationRuns,
    });

    const applicantCountByTerritory = new Map(
      baseSnapshot.coverageNeeds.map((row) => [row.territoryKey, row.applicantCount]),
    );
    const { ads, matchedRuleIds } = evaluateApprovalRules(
      baseSnapshot.postingRecommendations.map((ad) => ({ ...ad, approvalStatus: "pending" })),
      ctx.approvalRules,
      { coverageNeeds: baseSnapshot.coverageNeeds, applicantCountByTerritory },
    );

    for (const ruleId of [...new Set(matchedRuleIds)]) {
      await recordRuleTrigger(ruleId, true);
    }

    const approvalRules = await listApprovalRules();
    const snapshot = buildAutopilotSnapshot({
      jobs: ctx.jobs,
      candidates: ctx.candidates,
      workflows: ctx.workflows,
      opportunities: ctx.opportunities,
      scoredRows: ctx.scoredRows,
      fetchedAt: ctx.fetchedAt,
      territoryStates: ctx.territoryStates,
      approvalRules,
      automationRuns: ctx.automationRuns,
    });

    return NextResponse.json({
      ok: true,
      snapshot: { ...snapshot, postingRecommendations: ads },
      matchedRuleIds,
    });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
