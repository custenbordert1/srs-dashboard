import type { BreezyJob } from "@/lib/breezy-api";
import { resolveDmName } from "@/lib/dm-territory-map";
import type { P84UnlockRecoveryPlan } from "@/lib/p84-unlock-preview/types";
import {
  findActivePublishedDuplicate,
  findDuplicateFindings,
  buildDuplicateJobIndex,
  isPublishedStatus,
  type DuplicateJobIndex,
} from "@/lib/breezy-job-publish-review/detect-duplicate-jobs";
import type {
  BreezyJobPublishReviewMetrics,
  BreezyJobPublishReviewReport,
  JobPublishRecommendation,
  JobPublishReviewEntry,
  JobPublishRiskLevel,
} from "@/lib/breezy-job-publish-review/types";
import {
  JOB_PUBLISH_RECOMMENDATION_LABELS,
  P91_PREVIEW_MODE,
  P91_SOURCE_PHASE,
} from "@/lib/breezy-job-publish-review/types";

function inferJobFromCandidates(
  positionId: string,
  plans: P84UnlockRecoveryPlan[],
): Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status" | "updatedDate"> {
  const plan = plans.find((p) => p.positionId === positionId);
  const name = plan?.positionName ?? "Unknown position";
  // P216 — never invent city/state from the position title.
  return {
    jobId: positionId,
    name,
    city: "",
    state: plan?.dmTerritory ?? "",
    status: "unknown",
    updatedDate: "",
  };
}

function resolveJobRecord(
  positionId: string,
  index: DuplicateJobIndex,
  plans: P84UnlockRecoveryPlan[],
): BreezyJob | Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status" | "updatedDate"> {
  return (
    index.byJobId.get(positionId) ??
    inferJobFromCandidates(positionId, plans)
  );
}

function buildRecommendation(input: {
  job: Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status">;
  duplicatePublished: BreezyJob | null;
  duplicateFindingForJob: boolean;
}): {
  action: JobPublishRecommendation;
  risk: JobPublishRiskLevel;
  reason: string;
  shouldStayActiveJobId: string | null;
  autoApproveBlocked: boolean;
} {
  const status = input.job.status.trim().toLowerCase();

  if (input.duplicateFindingForJob && isPublishedStatus(input.job.status)) {
    return {
      action: "review",
      risk: "high",
      reason: "This job is an older duplicate published ad — human review required before any action.",
      shouldStayActiveJobId: null,
      autoApproveBlocked: true,
    };
  }

  if (input.duplicatePublished) {
    return {
      action: "keep_closed",
      risk: "high",
      reason: `Active published duplicate exists (${input.duplicatePublished.jobId} — ${input.duplicatePublished.name}). Do not publish/reactivate this ad.`,
      shouldStayActiveJobId: input.duplicatePublished.jobId,
      autoApproveBlocked: true,
    };
  }

  if (status === "published") {
    return {
      action: "review",
      risk: "medium",
      reason: "Job is already published but candidates are blocked — verify position ID mapping.",
      shouldStayActiveJobId: input.job.jobId,
      autoApproveBlocked: true,
    };
  }

  if (status === "closed" || status === "archived") {
    return {
      action: "reactivate",
      risk: "medium",
      reason: `Job is ${status} with no active duplicate — safe candidate for manual reactivation review.`,
      shouldStayActiveJobId: null,
      autoApproveBlocked: false,
    };
  }

  if (status === "draft") {
    return {
      action: "publish",
      risk: "medium",
      reason: "Job is draft with no active duplicate — candidate for manual publish review.",
      shouldStayActiveJobId: null,
      autoApproveBlocked: false,
    };
  }

  return {
    action: "review",
    risk: "high",
    reason: `Job status "${input.job.status || "unknown"}" requires human review before publish.`,
    shouldStayActiveJobId: null,
    autoApproveBlocked: true,
  };
}

function buildEntry(input: {
  positionId: string;
  plans: P84UnlockRecoveryPlan[];
  index: DuplicateJobIndex;
  duplicateOldPublishedIds: Set<string>;
}): JobPublishReviewEntry {
  const plans = input.plans.filter((p) => p.positionId === input.positionId);
  const job = resolveJobRecord(input.positionId, input.index, plans);
  const duplicatePublished = findActivePublishedDuplicate(input.index, job);
  const rec = buildRecommendation({
    job,
    duplicatePublished,
    duplicateFindingForJob: input.duplicateOldPublishedIds.has(job.jobId),
  });

  const dmTerritory = job.state || plans[0]?.dmTerritory || "";
  return {
    positionId: input.positionId,
    jobTitle: job.name,
    city: job.city ?? "",
    state: job.state ?? "",
    dmTerritory,
    suggestedDm: resolveDmName("", dmTerritory),
    candidateCount: plans.length,
    blockedCandidateCount: plans.length,
    blockedCandidateIds: plans.map((p) => p.candidateId),
    blockedCandidateNames: plans.map((p) => p.candidateName),
    currentBreezyStatus: job.status || "unknown",
    recommendedAction: rec.action,
    recommendationLabel: JOB_PUBLISH_RECOMMENDATION_LABELS[rec.action],
    riskLevel: rec.risk,
    reason: rec.reason,
    duplicateActiveJobId: duplicatePublished?.jobId ?? null,
    duplicateActiveJobTitle: duplicatePublished?.name ?? null,
    shouldStayActiveJobId: rec.shouldStayActiveJobId,
    manualApprovalRequired: true,
    autoApproveBlocked: rec.autoApproveBlocked,
  };
}

function buildMetrics(entries: JobPublishReviewEntry[]): BreezyJobPublishReviewMetrics {
  const safe = entries.filter(
    (e) =>
      (e.recommendedAction === "publish" || e.recommendedAction === "reactivate") &&
      !e.autoApproveBlocked,
  );
  return {
    jobsNeedingPublish: entries.filter(
      (e) => e.recommendedAction === "publish" || e.recommendedAction === "reactivate",
    ).length,
    safeToPublish: safe.length,
    duplicateConflict: entries.filter((e) => e.duplicateActiveJobId != null).length,
    shouldRemainClosed: entries.filter((e) => e.recommendedAction === "keep_closed").length,
    needsHumanReview: entries.filter((e) => e.recommendedAction === "review").length,
    candidatesUnlockedIfApproved: safe.reduce((sum, e) => sum + e.blockedCandidateCount, 0),
    totalJobsReviewed: entries.length,
  };
}

export function buildBreezyJobPublishReview(input: {
  unlockablePlans: P84UnlockRecoveryPlan[];
  publishedJobs: BreezyJob[];
  closedJobs: BreezyJob[];
  archivedJobs: BreezyJob[];
  mtdRangeLabel?: string;
  generatedAt?: string;
}): BreezyJobPublishReviewReport {
  const allJobs = [...input.publishedJobs, ...input.closedJobs, ...input.archivedJobs];
  const index = buildDuplicateJobIndex(allJobs);
  const duplicateFindings = findDuplicateFindings(index);
  const duplicateOldPublishedIds = new Set(
    duplicateFindings.flatMap((f) => f.duplicateJobIds),
  );

  const positionIds = [...new Set(input.unlockablePlans.map((p) => p.positionId).filter(Boolean))];
  const entries = positionIds.map((positionId) =>
    buildEntry({
      positionId,
      plans: input.unlockablePlans,
      index,
      duplicateOldPublishedIds,
    }),
  );

  const metrics = buildMetrics(entries);

  return {
    sourcePhase: P91_SOURCE_PHASE,
    previewMode: P91_PREVIEW_MODE,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    sectionTitle: "Breezy Job Publish Review",
    metrics,
    duplicateFindings,
    entries,
    safeToPublish: entries.filter(
      (e) =>
        (e.recommendedAction === "publish" || e.recommendedAction === "reactivate") &&
        !e.autoApproveBlocked,
    ),
    duplicateConflict: entries.filter((e) => e.duplicateActiveJobId != null),
    shouldRemainClosed: entries.filter((e) => e.recommendedAction === "keep_closed"),
    needsHumanReview: entries.filter((e) => e.recommendedAction === "review"),
    remainingBlockersBeforeP84Unlock: [
      "P91 is preview-only — no Breezy publish/reactivate writes",
      "Manual approval required for every job action",
      `${metrics.duplicateConflict} job(s) have active duplicate ad conflicts`,
      `${metrics.needsHumanReview} job(s) need human review`,
      "After approved job actions: run P62 recruiter assignment, P83 advancement, then P84 preview",
      "P84 liveSend must remain disabled until executive sign-off",
    ],
  };
}

export async function buildBreezyJobPublishReviewFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<BreezyJobPublishReviewReport> {
  const { buildP84UnlockPreviewFromStores } = await import("@/lib/p84-unlock-preview");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { currentMtdDateRange } = await import("@/lib/candidate-ingestion/mtd-candidates");

  const [unlockReport, published, closed, archived] = await Promise.all([
    buildP84UnlockPreviewFromStores(input),
    fetchBreezyJobs("published"),
    fetchBreezyJobs("closed"),
    fetchBreezyJobs("archived"),
  ]);

  const range = currentMtdDateRange();
  return buildBreezyJobPublishReview({
    unlockablePlans: unlockReport.unlockable,
    publishedJobs: published.ok ? published.jobs : [],
    closedJobs: closed.ok ? closed.jobs : [],
    archivedJobs: archived.ok ? archived.jobs : [],
    mtdRangeLabel: `${range.start}..${range.end}`,
  });
}
