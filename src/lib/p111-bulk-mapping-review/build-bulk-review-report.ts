import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { buildReviewWorkflowReport } from "@/lib/p109-project-mapping-review/build-review-workflow-report";
import { checkCandidateBulkApproveSafety } from "@/lib/p111-bulk-mapping-review/bulk-safety-rules";
import { groupPendingReviewItems } from "@/lib/p111-bulk-mapping-review/group-review-queue";
import { previewBulkDecisionImpact } from "@/lib/p111-bulk-mapping-review/preview-bulk-impact";
import type { BulkReviewToolsReport } from "@/lib/p111-bulk-mapping-review/types";
import { P111_SOURCE_PHASE } from "@/lib/p111-bulk-mapping-review/types";
import { isNewlyEligibleViaApproval } from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";

async function loadDryRunContext() {
  const { readIngestionStore } = await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadP100State } = await import("@/lib/controlled-live-send/controlled-live-send-store");

  const [store, bundle, jobsResult, closedJobsResult, onboardingRecords, p100State] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    fetchBreezyJobs("closed"),
    listAllCandidateOnboardingRecords(),
    loadP100State(),
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

  return {
    rowsByCandidateId,
    onboardingByCandidate,
    jobsByPositionId,
    closedJobsByPositionId,
    publishedJobs,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    p100SentIds,
  };
}

export async function buildBulkMappingReviewToolsReport(): Promise<BulkReviewToolsReport> {
  const warnings = [
    "P111 — bulk review tools; local .data only.",
    "P111 — no Breezy writes, no live sends, no live runner wiring.",
    "Mode: dryRun.",
  ];

  const [workflow, dryRunContext] = await Promise.all([
    buildReviewWorkflowReport(),
    loadDryRunContext(),
  ]);

  const safetyByCandidate = new Map<
    string,
    { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }
  >();

  let alreadySent = 0;
  let duplicateRisk = 0;
  let invalidEmail = 0;
  let belowConfidence = 0;
  let missingRecommended = 0;

  for (const item of workflow.reviewQueue) {
    const row = dryRunContext.rowsByCandidateId.get(item.candidateId);
    const baseline = row
      ? classifyPaperworkBlocker({
          row,
          onboarding: dryRunContext.onboardingByCandidate.get(item.candidateId) ?? null,
          jobsByPositionId: dryRunContext.jobsByPositionId,
          closedJobsByPositionId: dryRunContext.closedJobsByPositionId,
          publishedJobs: dryRunContext.publishedJobs,
          paperworkByGrade: dryRunContext.paperworkByGrade,
          p100SentIds: dryRunContext.p100SentIds,
        }).category
      : "missing_candidate_match";

    const check = checkCandidateBulkApproveSafety({ item, baselineBlocker: baseline });
    safetyByCandidate.set(item.candidateId, check);

    if (baseline === "already_sent") alreadySent += 1;
    if (baseline === "duplicate_risk") duplicateRisk += 1;
    if (baseline === "invalid_email") invalidEmail += 1;
    if (item.confidenceScore < 65) belowConfidence += 1;
    if (!item.recommendedPosition.positionId) missingRecommended += 1;
  }

  const groups = groupPendingReviewItems(workflow.reviewQueue, safetyByCandidate);
  const bulkApprovableGroups = groups.filter((g) => g.bulkApprovable);
  const individualOnly = groups.filter((g) => g.individualReviewOnly);

  let estimatedRecoverable = 0;
  for (const group of bulkApprovableGroups) {
    const preview = previewBulkDecisionImpact({
      group,
      action: "approved",
      sharedNote: "P111 dry-run bulk approval preview",
      dryRunContext,
      totalPendingBefore: workflow.metrics.pendingCount,
    });
    estimatedRecoverable += preview.newlyEligibleAfterApproval;
  }

  const metrics = {
    totalGroups: groups.length,
    bulkApprovableGroups: bulkApprovableGroups.length,
    individualReviewOnlyGroups: individualOnly.length,
    totalPendingCandidates: workflow.metrics.pendingCount,
    bulkApprovableCandidates: bulkApprovableGroups.reduce((sum, g) => sum + g.candidateCount, 0),
    estimatedCandidatesRecoverable: estimatedRecoverable,
    safetyExclusions: {
      alreadySent,
      duplicateRisk,
      invalidEmail,
      belowConfidenceThreshold: belowConfidence,
      missingRecommendedPosition: missingRecommended,
    },
  };

  const summary = [
    `${metrics.totalGroups} review groups from ${metrics.totalPendingCandidates} pending candidates.`,
    `${metrics.bulkApprovableGroups} bulk-approvable groups (${metrics.bulkApprovableCandidates} candidates).`,
    `${metrics.individualReviewOnlyGroups} individual-review-only groups.`,
    `Estimated ${metrics.estimatedCandidatesRecoverable} recoverable via bulk approve (dryRun).`,
  ].join(" ");

  return {
    sourcePhase: P111_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: "dryRun",
    summary,
    metrics,
    groups,
    topRecommendedBulkApprovals: bulkApprovableGroups
      .slice()
      .sort((a, b) => b.candidateCount - a.candidateCount || b.averageConfidence - a.averageConfidence)
      .slice(0, 10),
    warnings: [...warnings, ...workflow.warnings],
  };
}

export { previewBulkDecisionImpact, isNewlyEligibleViaApproval };
