import type { BreezyJob } from "@/lib/breezy-api";
import type { BreezyPositionFetchResult } from "@/lib/breezy-api";
import {
  buildDuplicateJobIndex,
  findActivePublishedDuplicate,
  findDuplicateFindings,
  isPublishedStatus,
  type DuplicateJobIndex,
} from "@/lib/breezy-job-publish-review/detect-duplicate-jobs";
import type { JobPublishDuplicateFinding } from "@/lib/breezy-job-publish-review/types";
import type { P84UnlockRecoveryPlan } from "@/lib/p84-unlock-preview/types";
import { resolveDmName } from "@/lib/dm-territory-map";
import type {
  BreezyJobManualAction,
  BreezyJobResolvedStatus,
  BreezyJobStatusReconciliationMetrics,
  BreezyJobStatusReconciliationReport,
  JobStatusRecommendation,
  JobStatusReconciliationEntry,
  JobStatusRiskLevel,
} from "@/lib/breezy-job-status-reconciliation/types";
import {
  BREEZY_JOB_RESOLVED_STATUS_LABELS,
  JOB_STATUS_RECOMMENDATION_LABELS,
  P92_PREVIEW_MODE,
  P92_SOURCE_PHASE,
} from "@/lib/breezy-job-status-reconciliation/types";

function emptyStatusCounts(): Record<BreezyJobResolvedStatus, number> {
  return {
    published: 0,
    unpublished: 0,
    closed: 0,
    archived: 0,
    deleted_not_found: 0,
    duplicate_active_exists: 0,
  };
}

function normalizePipelineStatus(status: string): string {
  return status.trim().toLowerCase();
}

function isOpenPublishedStatus(status: string): boolean {
  const normalized = normalizePipelineStatus(status);
  return normalized === "published" || normalized === "open";
}

function isUnpublishedStatus(status: string): boolean {
  const normalized = normalizePipelineStatus(status);
  return normalized === "draft" || normalized === "pending" || normalized === "paused";
}

function inferJobFromCandidates(
  positionId: string,
  plans: P84UnlockRecoveryPlan[],
): Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status" | "updatedDate"> {
  const plan = plans.find((p) => p.positionId === positionId);
  const name = plan?.positionName ?? "Unknown position";
  // P216 — never invent city/state from the position title. Prefer territory
  // state from the plan when available; otherwise leave empty until live
  // Position.Location is resolved.
  return {
    jobId: positionId,
    name,
    city: "",
    state: plan?.dmTerritory ?? "",
    status: "unknown",
    updatedDate: "",
  };
}

function resolveLiveJob(
  positionId: string,
  liveById: Map<string, BreezyPositionFetchResult>,
  index: DuplicateJobIndex,
  plans: P84UnlockRecoveryPlan[],
): { job: Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status" | "updatedDate">; liveFetchSucceeded: boolean } {
  const live = liveById.get(positionId);
  if (live?.ok && live.found) {
    return { job: live.job, liveFetchSucceeded: true };
  }
  const indexed = index.byJobId.get(positionId);
  if (indexed) {
    return { job: indexed, liveFetchSucceeded: false };
  }
  return { job: inferJobFromCandidates(positionId, plans), liveFetchSucceeded: false };
}

function resolveJobStatus(input: {
  job: Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status">;
  liveResult: BreezyPositionFetchResult | undefined;
  duplicatePublished: BreezyJob | null;
  duplicateOldPublished: boolean;
}): BreezyJobResolvedStatus {
  if (input.liveResult?.ok && !input.liveResult.found) {
    return "deleted_not_found";
  }

  const pipeline = normalizePipelineStatus(input.job.status);
  if (pipeline === "deleted") return "deleted_not_found";
  if (pipeline === "unknown") return "closed";

  if (input.duplicatePublished || input.duplicateOldPublished) {
    return "duplicate_active_exists";
  }

  if (isOpenPublishedStatus(input.job.status)) return "published";
  if (isUnpublishedStatus(input.job.status)) return "unpublished";
  if (pipeline === "closed") return "closed";
  if (pipeline === "archived") return "archived";

  return "closed";
}

function buildRecommendation(input: {
  resolvedStatus: BreezyJobResolvedStatus;
  job: Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status">;
  duplicatePublished: BreezyJob | null;
  duplicateOldPublished: boolean;
}): {
  recommendation: JobStatusRecommendation;
  risk: JobStatusRiskLevel;
  reason: string;
  actionNeeded: string;
  shouldStayActiveJobId: string | null;
  autoApproveBlocked: boolean;
} {
  if (input.resolvedStatus === "deleted_not_found") {
    return {
      recommendation: "missing_deleted_job",
      risk: "high",
      reason: "Position not found in live Breezy — verify mapping or recreate the job.",
      actionNeeded: "Confirm job was deleted; remap candidates or recreate position in Breezy.",
      shouldStayActiveJobId: null,
      autoApproveBlocked: true,
    };
  }

  if (normalizePipelineStatus(input.job.status) === "unknown") {
    return {
      recommendation: "human_review",
      risk: "high",
      reason: "Live Breezy position status could not be resolved — check API access or job ID mapping.",
      actionNeeded: "Verify Breezy API access and confirm position ID matches an existing job.",
      shouldStayActiveJobId: null,
      autoApproveBlocked: true,
    };
  }

  if (input.duplicateOldPublished && isPublishedStatus(input.job.status)) {
    return {
      recommendation: "duplicate_conflict",
      risk: "high",
      reason: "This job is an older duplicate published ad — retire or close before unlocking candidates.",
      actionNeeded: "Close or archive this duplicate ad; keep the newest published listing active.",
      shouldStayActiveJobId: null,
      autoApproveBlocked: true,
    };
  }

  if (input.duplicatePublished) {
    return {
      recommendation: "keep_closed",
      risk: "high",
      reason: `Active published duplicate exists (${input.duplicatePublished.jobId} — ${input.duplicatePublished.name}).`,
      actionNeeded: "Keep this ad closed; use the active duplicate listing for applicants.",
      shouldStayActiveJobId: input.duplicatePublished.jobId,
      autoApproveBlocked: true,
    };
  }

  if (input.resolvedStatus === "duplicate_active_exists") {
    return {
      recommendation: "duplicate_conflict",
      risk: "high",
      reason: "Duplicate active published ad conflict detected for this title/location.",
      actionNeeded: "Resolve duplicate ads in Breezy before unlocking blocked candidates.",
      shouldStayActiveJobId: null,
      autoApproveBlocked: true,
    };
  }

  if (input.resolvedStatus === "published") {
    return {
      recommendation: "human_review",
      risk: "medium",
      reason: "Job is published/open but candidates remain blocked — verify position ID mapping and eligibility.",
      actionNeeded: "Audit candidate-to-position mapping; no Breezy publish action needed.",
      shouldStayActiveJobId: input.job.jobId,
      autoApproveBlocked: true,
    };
  }

  if (input.resolvedStatus === "closed" || input.resolvedStatus === "archived") {
    return {
      recommendation: "safe_to_reactivate",
      risk: "medium",
      reason: `Job is ${input.resolvedStatus} with no active duplicate — candidate for manual reactivation.`,
      actionNeeded: "Manually reactivate this Breezy position after review.",
      shouldStayActiveJobId: null,
      autoApproveBlocked: false,
    };
  }

  if (input.resolvedStatus === "unpublished") {
    return {
      recommendation: "safe_to_publish",
      risk: "medium",
      reason: "Job is unpublished/draft with no active duplicate — candidate for manual publish.",
      actionNeeded: "Manually publish this Breezy position after review.",
      shouldStayActiveJobId: null,
      autoApproveBlocked: false,
    };
  }

  return {
    recommendation: "human_review",
    risk: "high",
    reason: `Unresolved Breezy status "${input.job.status}" requires human review.`,
    actionNeeded: "Review job in Breezy and confirm correct pipeline state.",
    shouldStayActiveJobId: null,
    autoApproveBlocked: true,
  };
}

function buildEntry(input: {
  positionId: string;
  plans: P84UnlockRecoveryPlan[];
  index: DuplicateJobIndex;
  liveById: Map<string, BreezyPositionFetchResult>;
  duplicateOldPublishedIds: Set<string>;
}): JobStatusReconciliationEntry {
  const plans = input.plans.filter((p) => p.positionId === input.positionId);
  const { job } = resolveLiveJob(
    input.positionId,
    input.liveById,
    input.index,
    plans,
  );
  const live = input.liveById.get(input.positionId);
  const duplicatePublished = findActivePublishedDuplicate(input.index, job);
  const duplicateOldPublished = input.duplicateOldPublishedIds.has(job.jobId);
  const resolvedStatus = resolveJobStatus({
    job,
    liveResult: live,
    duplicatePublished,
    duplicateOldPublished,
  });
  const rec = buildRecommendation({
    resolvedStatus,
    job,
    duplicatePublished,
    duplicateOldPublished,
  });

  const dmTerritory = job.state || plans[0]?.dmTerritory || "";
  const recruiters = [...new Set(plans.map((p) => p.recommendedRecruiter).filter(Boolean))];

  return {
    positionId: input.positionId,
    jobTitle: job.name,
    city: job.city ?? "",
    state: job.state ?? "",
    dmTerritory,
    suggestedDm: resolveDmName("", dmTerritory),
    recommendedRecruiter: recruiters.length === 1 ? recruiters[0]! : recruiters.join(", ") || "Unassigned",
    candidateCount: plans.length,
    blockedCandidateCount: plans.length,
    blockedCandidateIds: plans.map((p) => p.candidateId),
    blockedCandidateNames: plans.map((p) => p.candidateName),
    breezyPipelineStatus: job.status || "unknown",
    resolvedStatus,
    resolvedStatusLabel: BREEZY_JOB_RESOLVED_STATUS_LABELS[resolvedStatus],
    recommendation: rec.recommendation,
    recommendationLabel: JOB_STATUS_RECOMMENDATION_LABELS[rec.recommendation],
    actionNeeded: rec.actionNeeded,
    riskLevel: rec.risk,
    reason: rec.reason,
    duplicateActiveJobId: duplicatePublished?.jobId ?? null,
    duplicateActiveJobTitle: duplicatePublished?.name ?? null,
    shouldStayActiveJobId: rec.shouldStayActiveJobId,
    liveFetchSucceeded: Boolean(live?.ok && live.found),
    manualApprovalRequired: true,
    autoApproveBlocked: rec.autoApproveBlocked,
  };
}

function buildManualAction(entry: JobStatusReconciliationEntry): BreezyJobManualAction {
  return {
    jobTitle: entry.jobTitle,
    city: entry.city,
    state: entry.state,
    positionId: entry.positionId,
    currentStatus: entry.breezyPipelineStatus,
    resolvedStatus: entry.resolvedStatus,
    actionNeeded: entry.actionNeeded,
    recommendation: entry.recommendation,
    candidatesUnlocked: entry.autoApproveBlocked ? 0 : entry.blockedCandidateCount,
    risk: entry.riskLevel,
  };
}

function buildMetrics(
  entries: JobStatusReconciliationEntry[],
  liveStats: { found: number; notFound: number; fetchErrors: number },
): BreezyJobStatusReconciliationMetrics {
  const statusCounts = emptyStatusCounts();
  for (const entry of entries) {
    statusCounts[entry.resolvedStatus] += 1;
  }

  const approvable = entries.filter(
    (e) =>
      (e.recommendation === "safe_to_reactivate" || e.recommendation === "safe_to_publish") &&
      !e.autoApproveBlocked,
  );

  return {
    totalJobsReviewed: entries.length,
    statusCounts,
    safeToReactivate: entries.filter((e) => e.recommendation === "safe_to_reactivate").length,
    safeToPublish: entries.filter((e) => e.recommendation === "safe_to_publish").length,
    keepClosed: entries.filter((e) => e.recommendation === "keep_closed").length,
    duplicateConflict: entries.filter((e) => e.recommendation === "duplicate_conflict").length,
    missingDeletedJob: entries.filter((e) => e.recommendation === "missing_deleted_job").length,
    needsHumanReview: entries.filter((e) => e.recommendation === "human_review").length,
    candidatesUnlockedIfApproved: approvable.reduce((sum, e) => sum + e.blockedCandidateCount, 0),
    liveFetchFound: liveStats.found,
    liveFetchNotFound: liveStats.notFound,
    liveFetchErrors: liveStats.fetchErrors,
  };
}

function mergeJobsIntoIndex(index: DuplicateJobIndex, jobs: BreezyJob[]): DuplicateJobIndex {
  const merged = new Map(index.byJobId);
  for (const job of jobs) {
    merged.set(job.jobId, job);
  }
  return buildDuplicateJobIndex([...merged.values()]);
}

export function buildBreezyJobStatusReconciliation(input: {
  unlockablePlans: P84UnlockRecoveryPlan[];
  publishedJobs: BreezyJob[];
  closedJobs: BreezyJob[];
  archivedJobs: BreezyJob[];
  draftJobs: BreezyJob[];
  liveByPositionId: Map<string, BreezyPositionFetchResult>;
  liveFetchStats: { found: number; notFound: number; fetchErrors: number };
  mtdRangeLabel?: string;
  generatedAt?: string;
}): BreezyJobStatusReconciliationReport {
  const listJobs = [
    ...input.publishedJobs,
    ...input.closedJobs,
    ...input.archivedJobs,
    ...input.draftJobs,
  ];
  const liveJobs: BreezyJob[] = [];
  for (const result of input.liveByPositionId.values()) {
    if (result.ok && result.found) liveJobs.push(result.job);
  }

  let index = buildDuplicateJobIndex(listJobs);
  index = mergeJobsIntoIndex(index, liveJobs);

  const duplicateFindings: JobPublishDuplicateFinding[] = findDuplicateFindings(index);
  const duplicateOldPublishedIds = new Set(duplicateFindings.flatMap((f) => f.duplicateJobIds));

  const positionIds = [...new Set(input.unlockablePlans.map((p) => p.positionId).filter(Boolean))];
  const entries = positionIds.map((positionId) =>
    buildEntry({
      positionId,
      plans: input.unlockablePlans,
      index,
      liveById: input.liveByPositionId,
      duplicateOldPublishedIds,
    }),
  );

  const metrics = buildMetrics(entries, input.liveFetchStats);
  const manualActionList = entries.map(buildManualAction);

  return {
    sourcePhase: P92_SOURCE_PHASE,
    previewMode: P92_PREVIEW_MODE,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    sectionTitle: "Breezy Job Status Reconciliation",
    metrics,
    duplicateFindings,
    entries,
    manualActionList,
    safeToReactivate: entries.filter((e) => e.recommendation === "safe_to_reactivate"),
    safeToPublish: entries.filter((e) => e.recommendation === "safe_to_publish"),
    keepClosed: entries.filter((e) => e.recommendation === "keep_closed"),
    duplicateConflict: entries.filter((e) => e.recommendation === "duplicate_conflict"),
    missingDeletedJob: entries.filter((e) => e.recommendation === "missing_deleted_job"),
    needsHumanReview: entries.filter((e) => e.recommendation === "human_review"),
    remainingBlockersBeforeP84Unlock: [
      "P92 is preview-only — no Breezy publish/reactivate writes",
      "Manual approval required for every Breezy job action",
      `${metrics.duplicateConflict + metrics.keepClosed} job(s) have duplicate ad conflicts or must stay closed`,
      `${metrics.missingDeletedJob} job(s) missing or deleted in Breezy`,
      `${metrics.needsHumanReview} job(s) need human review (published but blocked or unresolved)`,
      "After approved job actions: run P62 recruiter assignment, P83 advancement, then P84 preview",
      "P84 liveSend must remain disabled until executive sign-off",
    ],
  };
}

export async function buildBreezyJobStatusReconciliationFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<BreezyJobStatusReconciliationReport> {
  const { buildP84UnlockPreviewFromStores } = await import("@/lib/p84-unlock-preview");
  const { fetchBreezyJobs, fetchBreezyPositionsByIds } = await import("@/lib/breezy-api");
  const { currentMtdDateRange } = await import("@/lib/candidate-ingestion/mtd-candidates");

  const unlockReport = await buildP84UnlockPreviewFromStores(input);
  const positionIds = [...new Set(unlockReport.unlockable.map((p) => p.positionId).filter(Boolean))];

  const [liveBatch, published, closed, archived, draft] = await Promise.all([
    fetchBreezyPositionsByIds(positionIds),
    fetchBreezyJobs("published"),
    fetchBreezyJobs("closed"),
    fetchBreezyJobs("archived"),
    fetchBreezyJobs("draft"),
  ]);

  const range = currentMtdDateRange();
  return buildBreezyJobStatusReconciliation({
    unlockablePlans: unlockReport.unlockable,
    publishedJobs: published.ok ? published.jobs : [],
    closedJobs: closed.ok ? closed.jobs : [],
    archivedJobs: archived.ok ? archived.jobs : [],
    draftJobs: draft.ok ? draft.jobs : [],
    liveByPositionId: liveBatch.byPositionId,
    liveFetchStats: {
      found: liveBatch.found,
      notFound: liveBatch.notFound,
      fetchErrors: liveBatch.fetchErrors,
    },
    mtdRangeLabel: `${range.start}..${range.end}`,
  });
}
