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

  const buildMs = Date.now() - startedAt;

  return NextResponse.json(
    {
      ok: true,
      snapshot,
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

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    rules?: ApprovalRule[];
  };

  if (body.action === "refresh-rules" && Array.isArray(body.rules)) {
    const saved = await saveApprovalRules(body.rules);
    return NextResponse.json({ ok: true, rules: saved });
  }

  if (body.action === "evaluate-rules") {
    const ctx = await loadSnapshotContext(guard.session);
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
