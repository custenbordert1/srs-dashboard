import { p97AuditLogPath, p97RollbackPath } from "@/lib/approval-mode-production/approval-mode-store";
import { p100AuditLogPath } from "@/lib/controlled-live-send/controlled-live-send-store";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildLiveSendOperatorChecklist } from "@/lib/live-send-operator-checklist";
import { buildLiveSendReadinessFromStores } from "@/lib/live-send-readiness/build-live-send-readiness";
import { buildControlledLiveSendReport } from "@/lib/controlled-live-send/execute-controlled-live-send";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { resolveClosedAdProjectMapping } from "@/lib/closed-ad-project-mapping/resolve-closed-ad-project-mapping";
import type {
  AutonomousPaperworkCandidateResult,
  AutonomousPaperworkMetrics,
  AutonomousPaperworkReport,
  AutonomousPaperworkRunMode,
} from "@/lib/p106-autonomous-paperwork-engine/types";
import { P106_DEFAULT_MODE, P106_SOURCE_PHASE } from "@/lib/p106-autonomous-paperwork-engine/types";

function buildMetrics(candidates: AutonomousPaperworkCandidateResult[]): AutonomousPaperworkMetrics {
  return {
    candidatesEvaluated: candidates.length,
    readyToSend: candidates.filter((c) => c.category === "ready_to_send").length,
    sent: candidates.filter((c) => c.category === "sent").length,
    skippedAlreadySent: candidates.filter(
      (c) => c.category === "sent" && Boolean(c.signatureRequestId?.trim()),
    ).length,
    blockedInvalidEmail: candidates.filter((c) => c.blockerCategory === "invalid_email").length,
    blockedUnpublishedJob: candidates.filter((c) => c.blockerCategory === "project_not_mappable").length,
    blockedDuplicateRisk: candidates.filter((c) => c.blockerCategory === "duplicate_risk").length,
    blockedP84: candidates.filter((c) => c.blockerCategory === "p84_gate_failed").length,
    blockedManualReview: candidates.filter(
      (c) =>
        c.category === "blocked" &&
        c.blockerCategory != null &&
        ![
          "invalid_email",
          "unpublished_job",
          "closed_job",
          "project_not_mappable",
          "project_mapping_review",
          "duplicate_risk",
          "p84_gate_failed",
          "already_sent",
        ].includes(c.blockerCategory),
    ).length,
    remainingActionNeeded: candidates.filter(
      (c) => c.category === "blocked" || c.category === "ready_to_send",
    ).length,
    autoRepairedCount: candidates.filter((c) => c.autoRepaired).length,
  };
}

export async function buildAutonomousPaperworkReport(input?: {
  mtdOnly?: boolean;
  mode?: AutonomousPaperworkRunMode;
  autoRepairedIds?: Set<string>;
  runSummary?: string | null;
  candidateIds?: string[];
}): Promise<AutonomousPaperworkReport> {
  const mode = input?.mode ?? P106_DEFAULT_MODE;
  const mtdOnly = input?.mtdOnly !== false;

  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadCandidateOnboardingPolicy } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-policy-store"
  );
  const { loadP100State } = await import("@/lib/controlled-live-send/controlled-live-send-store");

  const [store, bundle, jobsResult, closedJobsResult, onboardingRecords, policy, p100State, p84Flags, p99, p101, p100Report] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowBundle(),
      fetchBreezyJobs("published"),
      fetchBreezyJobs("closed"),
      listAllCandidateOnboardingRecords(),
      loadCandidateOnboardingPolicy(),
      loadP100State(),
      loadP84FeatureFlags(),
      buildLiveSendReadinessFromStores({ mtdOnly }),
      buildLiveSendOperatorChecklist({ mtdOnly }),
      buildControlledLiveSendReport({ mtdOnly, mode: mode === "dryRun" ? "dryRun" : "executeOne" }),
    ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const closedJobsByPositionId = new Map(
    (closedJobsResult.ok ? closedJobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const onboardingByCandidateId = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const p100SentIds = new Set(p100State.sentCandidateIds);

  const range = currentMtdDateRange();
  const ingested =
    mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);

  const candidateIds = new Set(ingested.map((c) => c.candidateId));
  const targetIds =
    input?.candidateIds?.length && input.candidateIds.length > 0
      ? input.candidateIds.filter((id) => candidateIds.has(id) || store.candidates[id])
      : [...candidateIds];

  const results: AutonomousPaperworkCandidateResult[] = [];

  for (const candidateId of targetIds) {
    const candidate = store.candidates[candidateId];
    if (!candidate) continue;

    const row = buildScoredWorkflowRow(candidate, bundle.workflows[candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    });
    const onboarding = onboardingByCandidateId.get(candidateId) ?? null;
    const activeOnboarding = onboarding;

    const blocker = classifyPaperworkBlocker({
      row,
      onboarding: activeOnboarding,
      jobsByPositionId,
      closedJobsByPositionId,
      publishedJobs,
      paperworkByGrade: policy.paperworkByGrade,
      p100SentIds,
    });

    const projectMapping = resolveClosedAdProjectMapping({
      row,
      positionTitle: candidate.positionName,
      candidateCity: candidate.city,
      candidateState: candidate.state,
      jobsByPositionId,
      closedJobsByPositionId,
      publishedJobs,
    });

    const p84 = buildPaperworkSendEligibility({
      row,
      onboarding: activeOnboarding,
      jobsByPositionId,
      projectMapping,
    });

    const name =
      `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim() ||
      candidate.email ||
      candidateId;

    let category: AutonomousPaperworkCandidateResult["category"] = "blocked";
    if (blocker.category === "already_sent") {
      category = "sent";
    } else if (p84.eligible) {
      category = "ready_to_send";
    } else {
      category = "blocked";
    }

    results.push({
      candidateId,
      candidateName: name,
      email: candidate.email?.trim() ?? "",
      positionId: candidate.positionId ?? null,
      positionTitle: candidate.positionName ?? null,
      recruiter: row.assignedRecruiter,
      dm: row.assignedDM,
      category,
      blockerCategory: category === "ready_to_send" ? null : blocker.category,
      blockerReason: category === "ready_to_send" ? null : blocker.reason,
      recommendedFix: category === "ready_to_send" ? null : blocker.recommendedFix,
      p84Eligible: p84.eligible,
      autoRepairable: blocker.autoRepairable,
      autoRepaired: input?.autoRepairedIds?.has(candidateId) ?? false,
      signatureRequestId: row.signatureRequestId,
      sentAt: row.paperworkSentAt,
      workflowStatus: row.workflowStatus,
      onboardingStatus: activeOnboarding?.status ?? null,
    });
  }

  const gateDetails: string[] = [];
  if (!p99.metrics.readinessPassCount) {
    gateDetails.push("P99 readiness not fully approved.");
  }
  if (p101.goNoGo !== "GO") {
    gateDetails.push(`P101 operator checklist: ${p101.goNoGoReason}`);
  }
  if (p100Report.goNoGo !== "go") {
    gateDetails.push(`P100 locks: ${p100Report.goNoGoReason}`);
  }
  if (!p84Flags.liveSend && mode !== "dryRun") {
    gateDetails.push("P84 liveSend disabled — enable before live sends.");
  }

  return {
    sourcePhase: P106_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    sectionTitle: "Autonomous Paperwork Engine",
    mode,
    mtdOnly,
    metrics: buildMetrics(results),
    readyToSend: results.filter((c) => c.category === "ready_to_send"),
    sent: results.filter((c) => c.category === "sent"),
    blocked: results.filter((c) => c.category === "blocked"),
    skippedAlreadySent: results.filter(
      (c) => c.category === "sent" && Boolean(c.signatureRequestId?.trim()),
    ),
    candidates: results,
    gates: {
      p99Ready: p99.metrics.readinessPassCount > 0,
      p101Go: p101.goNoGo === "GO",
      p100LocksPass: p100Report.goNoGo === "go",
      liveSendEnabled: p84Flags.liveSend,
      detail: gateDetails,
    },
    artifactPaths: {
      p97Audit: p97AuditLogPath(),
      p97Rollback: p97RollbackPath(),
      p100Audit: p100AuditLogPath(),
    },
    runSummary: input?.runSummary ?? null,
  };
}
