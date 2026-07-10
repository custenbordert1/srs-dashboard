import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { buildReviewWorkflowReport } from "@/lib/p109-project-mapping-review/build-review-workflow-report";
import type { P109ReviewDecision } from "@/lib/p109-project-mapping-review/types";
import {
  applyBulkGroupDecision,
  checkCandidateBulkApproveSafety,
  groupPendingReviewItems,
  previewBulkImpact,
} from "@/lib/p111-bulk-mapping-review";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function loadContext() {
  const { readIngestionStore } = await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadP100State } = await import("@/lib/controlled-live-send/controlled-live-send-store");

  const [store, bundle, jobsResult, closedJobsResult, onboardingRecords, p100State, workflow] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowBundle(),
      fetchBreezyJobs("published"),
      fetchBreezyJobs("closed"),
      listAllCandidateOnboardingRecords(),
      loadP100State(),
      buildReviewWorkflowReport(),
    ]);

  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const closedJobsByPositionId = new Map(
    (closedJobsResult.ok ? closedJobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const p100SentIds = new Set(p100State.sentCandidateIds ?? []);
  const rowsByCandidateId = new Map(
    Object.entries(store.candidates).map(([id, candidate]) => [
      id,
      buildScoredWorkflowRow(candidate, bundle.workflows[id], {
        job: jobsByPositionId.get(candidate.positionId) ?? closedJobsByPositionId.get(candidate.positionId),
      }),
    ]),
  );

  const safetyByCandidate = new Map<
    string,
    { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }
  >();
  for (const item of workflow.reviewQueue) {
    const row = rowsByCandidateId.get(item.candidateId);
    const baseline = row
      ? classifyPaperworkBlocker({
          row,
          onboarding: onboardingByCandidate.get(item.candidateId) ?? null,
          jobsByPositionId,
          closedJobsByPositionId,
          publishedJobs,
          paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
          p100SentIds,
        }).category
      : "missing_candidate_match";
    safetyByCandidate.set(
      item.candidateId,
      checkCandidateBulkApproveSafety({ item, baselineBlocker: baseline }),
    );
  }

  const groups = groupPendingReviewItems(workflow.reviewQueue, safetyByCandidate);

  return {
    workflow,
    groups,
    safetyByCandidate,
    dryRunContext: {
      rowsByCandidateId,
      onboardingByCandidate,
      jobsByPositionId,
      closedJobsByPositionId,
      publishedJobs,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds,
    },
  };
}

/** POST /api/project-mapping/bulk-review/preview — dry-run impact before bulk save */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as {
    groupId?: string;
    action?: P109ReviewDecision;
    sharedNote?: string;
  };

  if (!body.groupId?.trim() || !body.action) {
    return NextResponse.json({ ok: false, error: "groupId and action required." }, { status: 400 });
  }

  const { workflow, groups, dryRunContext } = await loadContext();
  const group = groups.find((g) => g.groupId === body.groupId);
  if (!group) {
    return NextResponse.json({ ok: false, error: "Group not found." }, { status: 404 });
  }

  const preview = previewBulkImpact({
    group,
    action: body.action,
    sharedNote: body.sharedNote ?? "",
    dryRunContext,
    totalPendingBefore: workflow.metrics.pendingCount,
  });

  return NextResponse.json({
    ok: true,
    preview,
    warnings: ["P111 preview only — no decisions saved.", "No Breezy writes."],
  });
}

/** PUT /api/project-mapping/bulk-review/preview — apply bulk decision locally */
export async function PUT(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as {
    groupId?: string;
    action?: P109ReviewDecision;
    sharedNote?: string;
  };

  if (!body.groupId?.trim() || !body.action) {
    return NextResponse.json({ ok: false, error: "groupId and action required." }, { status: 400 });
  }

  const { groups, safetyByCandidate } = await loadContext();
  const group = groups.find((g) => g.groupId === body.groupId);
  if (!group) {
    return NextResponse.json({ ok: false, error: "Group not found." }, { status: 404 });
  }

  const result = await applyBulkGroupDecision({
    group,
    action: body.action,
    sharedNote: body.sharedNote ?? "",
    reviewer: guard.session.userId,
    safetyByCandidate,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "Bulk action failed." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    records: result.records,
    warnings: ["P111 bulk decision saved locally — no Breezy writes.", "No live runner wiring."],
  });
}
