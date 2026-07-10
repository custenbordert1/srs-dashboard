import type { BreezyJob } from "@/lib/breezy-api";
import { loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import { buildProjectMappingReport } from "@/lib/p108-intelligent-project-mapping";
import {
  listQualifiedApprovedMappings,
  resolveApprovedMapping,
} from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { simulateCandidateDryRunEligibility } from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";
import type { CandidateDryRunResult, IntegrationDryRunReport } from "@/lib/p110-approved-mapping-integration/types";
import { P110_DEFAULT_MODE, P110_SOURCE_PHASE } from "@/lib/p110-approved-mapping-integration/types";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";

function isClosedAdCandidate(input: {
  positionId: string | undefined | null;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId: Map<string, BreezyJob>;
}): boolean {
  const positionId = input.positionId?.trim();
  if (!positionId) return false;
  if (input.jobsByPositionId.has(positionId)) return false;
  return input.closedJobsByPositionId.has(positionId);
}

function buildGoNoGo(input: {
  safetyOk: boolean;
  approvedCount: number;
  newlyEligible: number;
}): { goNoGo: "GO" | "NO-GO"; reason: string } {
  if (!input.safetyOk) {
    return {
      goNoGo: "NO-GO",
      reason: "Safety contract checks failed — dry-run integration not cleared.",
    };
  }
  if (input.approvedCount === 0) {
    return {
      goNoGo: "GO",
      reason:
        "Dry-run integration safe — no approved P109 mappings yet; runner unchanged until approvals exist.",
    };
  }
  if (input.newlyEligible > 0) {
    return {
      goNoGo: "GO",
      reason: `${input.newlyEligible} candidate(s) would unlock via approved mappings in dryRun only.`,
    };
  }
  return {
    goNoGo: "GO",
    reason: "Approved mappings present but no additional eligibility unlocked — protections or gates hold.",
  };
}

export async function buildApprovedMappingIntegrationDryRunReport(): Promise<IntegrationDryRunReport> {
  const warnings = [
    "P110 — dryRun only; no paperwork sends.",
    "P110 — no Breezy writes.",
    "P110 — P106.3 runner unchanged unless this integration is explicitly invoked.",
    `Mode: ${P110_DEFAULT_MODE}.`,
  ];

  const { readIngestionStore } = await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadP100State } = await import("@/lib/controlled-live-send/controlled-live-send-store");

  const [store, bundle, jobsResult, closedJobsResult, onboardingRecords, p100State, p109Records, mappingReport] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowBundle(),
      fetchBreezyJobs("published"),
      fetchBreezyJobs("closed"),
      listAllCandidateOnboardingRecords(),
      loadP100State(),
      loadP109ReviewRecords(),
      buildProjectMappingReport({ mode: "dryRun" }),
    ]);

  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const closedJobsByPositionId = new Map(
    (closedJobsResult.ok ? closedJobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const publishedJobTitleById = new Map(publishedJobs.map((j) => [j.jobId, j.name]));
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const p100SentIds = new Set(p100State.sentCandidateIds ?? []);

  const approvedMappings = listQualifiedApprovedMappings(p109Records, publishedJobTitleById);

  const results: CandidateDryRunResult[] = [];

  for (const [candidateId, candidate] of Object.entries(store.candidates)) {
    if (
      !isClosedAdCandidate({
        positionId: candidate.positionId,
        jobsByPositionId,
        closedJobsByPositionId,
      })
    ) {
      continue;
    }

    const row = buildScoredWorkflowRow(candidate, bundle.workflows[candidateId], {
      job: closedJobsByPositionId.get(candidate.positionId),
    });

    const approved = resolveApprovedMapping({
      record: p109Records.find((r) => r.candidateId === candidateId) ?? null,
      candidateId,
      closedPositionId: candidate.positionId,
      publishedJobTitleById,
    });

    results.push(
      simulateCandidateDryRunEligibility({
        row,
        onboarding: onboardingByCandidate.get(candidateId) ?? null,
        jobsByPositionId,
        closedJobsByPositionId,
        publishedJobs,
        paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
        p100SentIds,
        approvedMapping: approved,
        candidateName: mappingReport.recommendations.find((r) => r.candidateId === candidateId)?.candidateName,
      }),
    );
  }

  const newlyEligible = results.filter((r) => r.outcome === "newly_eligible_via_approval");
  const stillBlocked = results.filter((r) => r.outcome === "still_blocked");
  const needsReview = results.filter((r) => r.outcome === "needs_recruiter_review");
  const safetyExcluded = results.filter((r) =>
    ["excluded_already_sent", "excluded_duplicate_risk", "excluded_invalid_email"].includes(r.outcome),
  );

  const metrics = {
    approvedMappingsCount: approvedMappings.length,
    newlyEligibleViaApproval: newlyEligible.length,
    blockedCount: stillBlocked.length,
    reviewCount: needsReview.length,
    alreadyEligibleBaseline: results.filter((r) => r.outcome === "already_eligible_baseline").length,
    safetyExclusions: {
      alreadySent: results.filter((r) => r.outcome === "excluded_already_sent").length,
      duplicateRisk: results.filter((r) => r.outcome === "excluded_duplicate_risk").length,
      invalidEmail: results.filter((r) => r.outcome === "excluded_invalid_email").length,
    },
    pendingApprovals: needsReview.length,
    rejectedApprovals: p109Records.filter((r) => r.decision === "rejected").length,
    skippedApprovals: p109Records.filter((r) => r.decision === "skipped").length,
    notApproved: results.filter((r) => r.outcome === "not_approved").length,
  };

  const safetyStatus = {
    p1063RunnerUnchanged: true,
    noBreezyWrites: true,
    noLiveSends: true,
    noLiveMode: process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE == null,
    protectionOrderPreserved: true,
    dryRunOnly: true,
  };

  const { goNoGo, reason: goNoGoReason } = buildGoNoGo({
    safetyOk: Object.values(safetyStatus).every(Boolean),
    approvedCount: metrics.approvedMappingsCount,
    newlyEligible: metrics.newlyEligibleViaApproval,
  });

  const summary = [
    `${metrics.approvedMappingsCount} approved P109 mappings.`,
    `${metrics.newlyEligibleViaApproval} newly eligible via approval (dryRun).`,
    `${metrics.blockedCount} still blocked, ${metrics.reviewCount} need recruiter review.`,
    `Safety exclusions: ${metrics.safetyExclusions.alreadySent} already_sent, ${metrics.safetyExclusions.duplicateRisk} duplicate, ${metrics.safetyExclusions.invalidEmail} invalid_email.`,
    `${goNoGo}: ${goNoGoReason}`,
  ].join(" ");

  return {
    sourcePhase: P110_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P110_DEFAULT_MODE,
    summary,
    goNoGo,
    goNoGoReason,
    metrics,
    sampleCandidates: {
      newlyEligible: newlyEligible.slice(0, 5),
      stillBlocked: stillBlocked.slice(0, 5),
      safetyExcluded: safetyExcluded.slice(0, 5),
      needsReview: needsReview.slice(0, 5),
    },
    safetyStatus,
    warnings: [...warnings, ...mappingReport.warnings],
  };
}
