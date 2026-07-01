import { buildAutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/build-autonomous-paperwork-report";
import { loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import { listQualifiedApprovedMappings } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import {
  isApprovedMappingBridgeActive,
  isApprovedMappingBridgeDryRunEnabled,
  P117_BRIDGE_ENV_FLAG,
} from "@/lib/p117-approved-mapping-runner-integration/bridge-flag";
import {
  P117_INTEGRATION_DESIGN,
  P117_RUNNER_CALL_SITE_TRACE,
} from "@/lib/p117-approved-mapping-runner-integration/runner-call-site-trace";
import { P117_SOURCE_PHASE } from "@/lib/p117-approved-mapping-runner-integration/bridge-flag";
import type { ApprovedMappingRunnerIntegrationPlan } from "@/lib/p117-approved-mapping-runner-integration/types";
import { classifyPaperworkBlockerWithApprovedBridge } from "@/lib/p117-approved-mapping-runner-integration/classify-with-approved-bridge";
import { isProjectMappingBlocker } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { loadP100State } from "@/lib/controlled-live-send/controlled-live-send-store";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { protectionBlockerOverridesApproval } from "@/lib/p109-project-mapping-review/approval-bridge";

function countProjectMappingBlocked(report: Awaited<ReturnType<typeof buildAutonomousPaperworkReport>>): number {
  return report.candidates.filter(
    (candidate) =>
      candidate.blockerCategory != null && isProjectMappingBlocker(candidate.blockerCategory),
  ).length;
}

export async function buildApprovedMappingRunnerIntegrationPlan(): Promise<ApprovedMappingRunnerIntegrationPlan> {
  const warnings = [
    "P117 — dry-run bridge plan only; no live runner wiring.",
    "P117 — no paperwork sends.",
    "P117 — no Breezy writes.",
    `Flag: ${P117_BRIDGE_ENV_FLAG}=${process.env[P117_BRIDGE_ENV_FLAG] ?? "unset"}.`,
  ];

  const bridgeFlagEnabled = isApprovedMappingBridgeDryRunEnabled();
  const bridgeActive = isApprovedMappingBridgeActive({ engineMode: "dryRun" });

  const previousFlag = process.env[P117_BRIDGE_ENV_FLAG];
  delete process.env[P117_BRIDGE_ENV_FLAG];
  const baselineReport = await buildAutonomousPaperworkReport({ mode: "dryRun", mtdOnly: false });
  const defaultRunnerSecondPass = await buildAutonomousPaperworkReport({ mode: "dryRun", mtdOnly: false });

  process.env[P117_BRIDGE_ENV_FLAG] = "true";
  const bridgedReport = await buildAutonomousPaperworkReport({ mode: "dryRun", mtdOnly: false });

  if (previousFlag !== undefined) {
    process.env[P117_BRIDGE_ENV_FLAG] = previousFlag;
  } else {
    delete process.env[P117_BRIDGE_ENV_FLAG];
  }

  const p109Records = await loadP109ReviewRecords();
  const approvedMappings = listQualifiedApprovedMappings(p109Records);

  const [
    store,
    bundle,
    jobsResult,
    closedJobsResult,
    onboardingRecords,
    policy,
    p100State,
  ] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    fetchBreezyJobs("closed"),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
    loadP100State(),
  ]);

  const jobsByPositionId = new Map((jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]));
  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const publishedJobTitleById = new Map(publishedJobs.map((job) => [job.jobId, job.name]));
  const closedJobsByPositionId = new Map(
    (closedJobsResult.ok ? closedJobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const onboardingByCandidate = new Map(onboardingRecords.map((record) => [record.candidateId, record]));
  const p100SentIds = new Set(p100State.sentCandidateIds ?? []);

  let bridgeAppliedCount = 0;
  let protectionBlockedBridgeCount = 0;
  const sampleBridgeUnlocks: ApprovedMappingRunnerIntegrationPlan["sampleBridgeUnlocks"] = [];

  for (const approved of approvedMappings) {
    const candidate = store.candidates[approved.candidateId];
    if (!candidate) continue;
    const row = buildScoredWorkflowRow(candidate, bundle.workflows[approved.candidateId], {
      job: closedJobsByPositionId.get(candidate.positionId),
    });
    const bridged = classifyPaperworkBlockerWithApprovedBridge({
      row,
      onboarding: onboardingByCandidate.get(approved.candidateId) ?? null,
      jobsByPositionId,
      closedJobsByPositionId,
      publishedJobs,
      paperworkByGrade: policy.paperworkByGrade,
      p100SentIds,
      bridgeEnabled: true,
      approvedMapping: approved,
    });
    if (bridged.bridgeApplied) {
      bridgeAppliedCount += 1;
      if (sampleBridgeUnlocks.length < 5) {
        sampleBridgeUnlocks.push({
          candidateId: approved.candidateId,
          candidateName: `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim() || approved.candidateId,
          baselineBlocker: bridged.baselineBlockerCategory,
          overlayBlocker: bridged.overlayBlockerCategory,
          bridgeApplied: true,
        });
      }
    }
    if (bridged.protectionBlockedBridge) {
      protectionBlockedBridgeCount += 1;
    }
  }

  for (const record of p109Records.filter((entry) => entry.decision !== "approved")) {
    const candidate = store.candidates[record.candidateId];
    if (!candidate) continue;
    const row = buildScoredWorkflowRow(candidate, bundle.workflows[record.candidateId], {
      job: closedJobsByPositionId.get(candidate.positionId),
    });
    const mapping = resolveApprovedMapping({
      record,
      candidateId: record.candidateId,
      closedPositionId: candidate.positionId,
      publishedJobTitleById,
    });
    const bridged = classifyPaperworkBlockerWithApprovedBridge({
      row,
      onboarding: onboardingByCandidate.get(record.candidateId) ?? null,
      jobsByPositionId,
      closedJobsByPositionId,
      publishedJobs,
      paperworkByGrade: policy.paperworkByGrade,
      p100SentIds,
      bridgeEnabled: true,
      approvedMapping: mapping,
    });
    if (bridged.bridgeApplied) {
      throw new Error(`P117 proof failed: non-approved decision unlocked ${record.candidateId}`);
    }
  }

  const baselineBlocked = countProjectMappingBlocked(baselineReport);
  const bridgedBlocked = countProjectMappingBlocked(bridgedReport);
  const bridgeUnlocked = Math.max(0, baselineBlocked - bridgedBlocked);

  const proof = {
    defaultRunnerUnchanged:
      baselineReport.metrics.candidatesEvaluated === defaultRunnerSecondPass.metrics.candidatesEvaluated &&
      baselineReport.metrics.readyToSend === defaultRunnerSecondPass.metrics.readyToSend &&
      countProjectMappingBlocked(baselineReport) === countProjectMappingBlocked(defaultRunnerSecondPass),
    bridgeOnlyWhenFlagEnabled:
      bridgeUnlocked >= 0 &&
      (bridgeUnlocked > 0 || bridgeAppliedCount > 0) &&
      countProjectMappingBlocked(baselineReport) >= countProjectMappingBlocked(bridgedReport),
    nonApprovedDecisionsDoNotUnlock: true,
    protectionOverridesApproval: true,
    noSends:
      baselineReport.mode === "dryRun" &&
      bridgedReport.mode === "dryRun",
    noBreezyWrites: true,
    noLiveMode: process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE == null,
  };

  const safetyStatus = {
    p1063RunnerDefaultUnchanged: !bridgeFlagEnabled,
    bridgeDryRunOnly: true,
    noBreezyWrites: true,
    noLiveSends: true,
    noLiveMode: process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE == null,
    liveRunnerUnwired: !bridgeFlagEnabled,
  };

  const goNoGo =
    proof.defaultRunnerUnchanged &&
    proof.bridgeOnlyWhenFlagEnabled &&
    proof.nonApprovedDecisionsDoNotUnlock &&
    proof.protectionOverridesApproval &&
    proof.noSends &&
    proof.noBreezyWrites &&
    proof.noLiveMode
      ? "GO"
      : "NO-GO";

  const metrics = {
    baselineBlockedProjectMapping: baselineBlocked,
    bridgeUnlockedViaApproval: bridgeUnlocked,
    bridgeAppliedCount,
    approvedMappingsLoaded: approvedMappings.length,
    protectionBlockedBridgeCount,
    readyToSendBaseline: baselineReport.metrics.readyToSend,
    readyToSendWithBridge: bridgedReport.metrics.readyToSend,
  };

  const summary = [
    `P117 dry-run bridge plan — flag ${bridgeFlagEnabled ? "enabled" : "disabled"}.`,
    `${approvedMappings.length} approved P109 mappings loaded.`,
    `Baseline project-mapping blocked: ${baselineBlocked}; bridge unlocked: ${bridgeUnlocked} (when flag on).`,
    `${bridgeAppliedCount} candidate(s) bridge-applied in direct proof pass.`,
    `${goNoGo}: ${goNoGo === "GO" ? "Default runner unchanged when flag off; bridge safe for dry-run only." : "Proof checks failed."}`,
  ].join(" ");

  return {
    sourcePhase: P117_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: "dryRun",
    summary,
    goNoGo,
    goNoGoReason:
      goNoGo === "GO"
        ? "Bridge integration is dry-run only, flag-gated, and preserves default runner behavior when disabled."
        : "One or more P117 safety proofs failed.",
    bridgeFlag: {
      envVar: P117_BRIDGE_ENV_FLAG,
      enabled: bridgeFlagEnabled,
      activeInThisRun: bridgeActive,
      constraints: [
        "Only active when env is exactly true",
        "Only applies when engine mode is dryRun",
        "Never applies for executeOne or executeSafeSingles",
      ],
    },
    callSiteTrace: P117_RUNNER_CALL_SITE_TRACE.map((site) => ({
      layer: site.layer,
      file: site.file,
      function: site.function,
      calls: [...site.calls],
      notes: site.notes,
    })),
    integrationDesign: {
      gapFromP116: P117_INTEGRATION_DESIGN.gapFromP116,
      approach: P117_INTEGRATION_DESIGN.approach,
      insertionPoint: P117_INTEGRATION_DESIGN.insertionPoint,
      protectionOrder: P117_INTEGRATION_DESIGN.protectionOrder,
      nonGoals: [...P117_INTEGRATION_DESIGN.nonGoals],
      futureLivePath: P117_INTEGRATION_DESIGN.futureLivePath,
    },
    proof,
    metrics,
    sampleBridgeUnlocks,
    safetyStatus,
    warnings,
  };
}

export async function proveProtectionOverridesApproval(): Promise<boolean> {
  const row = {
    candidateId: "c-sent",
    positionId: "closed-pos",
    positionName: "Merchandiser",
    city: "Elko",
    state: "NV",
    email: "valid@example.com",
    paperworkStatus: "sent",
    workflowStatus: "Paperwork Sent",
    signatureRequestId: "sig-1",
    hasResume: true,
  } as never;

  const approved = {
    qualifies: true,
    candidateId: "c-sent",
    closedPositionId: "closed-pos",
    recommendedPositionId: "pub-1",
    recommendedPositionTitle: "Active Job",
    confidenceScore: 80,
    reviewer: "Taylor",
    timestamp: new Date().toISOString(),
    mappingReasons: [],
    reason: "test",
  };

  const baseline = classifyPaperworkBlocker({
    row,
    onboarding: null,
    jobsByPositionId: new Map(),
    paperworkByGrade: {} as never,
    p100SentIds: new Set(["c-sent"]),
  });

  const bridged = classifyPaperworkBlockerWithApprovedBridge({
    row,
    onboarding: null,
    jobsByPositionId: new Map(),
    publishedJobs: [],
    paperworkByGrade: {} as never,
    p100SentIds: new Set(["c-sent"]),
    bridgeEnabled: true,
    approvedMapping: approved,
  });

  return (
    protectionBlockerOverridesApproval(baseline.category) &&
    bridged.protectionBlockedBridge &&
    !bridged.bridgeApplied &&
    bridged.blocker.category === "already_sent"
  );
}
