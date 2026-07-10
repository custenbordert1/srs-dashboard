import { buildAutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/build-autonomous-paperwork-report";
import { buildAutonomousPaperworkOperationsCenterReport } from "@/lib/p118-autonomous-paperwork-operations-center/build-operations-center-report";
import { resolveMappingApprovalStatus } from "@/lib/p109-project-mapping-review/approval-bridge";
import { findP109ReviewRecord, loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import { buildProjectMappingReport } from "@/lib/p108-intelligent-project-mapping";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { buildP84OperationalQueueFromStores } from "@/lib/p84-operational-queue/build-operational-queue";
import { loadMonitorState } from "@/lib/paperwork-monitor/monitor-store";
import {
  buildActionQueue,
  estimateRecruiterHoursSaved,
} from "@/lib/p119-autonomous-recovery-engine/build-action-queue";
import { buildRecoveryCandidateAnalysis } from "@/lib/p119-autonomous-recovery-engine/classify-recovery-candidate";
import { buildImpactSimulation } from "@/lib/p119-autonomous-recovery-engine/build-impact-simulation";
import {
  P119_DEFAULT_MODE,
  P119_SOURCE_PHASE,
  type AutonomousRecoveryReport,
  type LargestBlocker,
  type RecoveryCategory,
  type RecoveryDistribution,
  type RecoveryOpportunity,
  type RecoveryTrendPoint,
} from "@/lib/p119-autonomous-recovery-engine/types";

const RECOVERY_CATEGORIES: RecoveryCategory[] = [
  "AUTO_RECOVERABLE",
  "REQUIRES_MAPPING_APPROVAL",
  "UNPUBLISHED_JOB",
  "INVALID_EMAIL",
  "DUPLICATE_RISK",
  "AWAITING_SIGNATURE",
  "READY_AFTER_SIGNATURE",
  "READY_AFTER_JOB_POSTED",
  "MANUAL_RECRUITER_REVIEW",
  "DO_NOT_RECOVER",
];

function buildRecoveryDistribution(
  candidates: ReturnType<typeof buildRecoveryCandidateAnalysis>[],
): RecoveryDistribution[] {
  return RECOVERY_CATEGORIES.map((category) => {
    const rows = candidates.filter((candidate) => candidate.recoveryCategory === category);
    const unlock = rows.reduce((sum, row) => sum + row.estimatedUnlock, 0);
    const averageScore =
      rows.length > 0
        ? Math.round(rows.reduce((sum, row) => sum + row.recoveryScore, 0) / rows.length)
        : 0;
    return { category, count: rows.length, estimatedUnlock: unlock, averageScore };
  }).filter((entry) => entry.count > 0);
}

function buildLargestBlockers(
  candidates: ReturnType<typeof buildRecoveryCandidateAnalysis>[],
): LargestBlocker[] {
  const counts = new Map<string, { count: number; unlock: number; category: RecoveryCategory }>();
  for (const candidate of candidates) {
    const key = candidate.blockerCategory ?? "unknown";
    const existing = counts.get(key) ?? {
      count: 0,
      unlock: 0,
      category: candidate.recoveryCategory,
    };
    existing.count += 1;
    existing.unlock += candidate.estimatedUnlock;
    counts.set(key, existing);
  }
  return [...counts.entries()]
    .map(([blockerCategory, value]) => ({
      blockerCategory,
      count: value.count,
      recoveryCategory: value.category,
      estimatedUnlock: value.unlock,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);
}

function buildTopOpportunities(
  candidates: ReturnType<typeof buildRecoveryCandidateAnalysis>[],
): RecoveryOpportunity[] {
  return [...candidates]
    .filter((candidate) => candidate.estimatedUnlock > 0)
    .sort((left, right) => right.recoveryScore - left.recoveryScore)
    .slice(0, 10)
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      candidateName: candidate.candidateName,
      recoveryCategory: candidate.recoveryCategory,
      recoveryScore: candidate.recoveryScore,
      estimatedUnlock: candidate.estimatedUnlock,
      recommendedNextAction: candidate.recommendedNextAction,
    }));
}

function buildRecoveryTrend(
  candidates: ReturnType<typeof buildRecoveryCandidateAnalysis>[],
): RecoveryTrendPoint[] {
  const recoverable = candidates.filter((candidate) => candidate.estimatedUnlock > 0);
  const blocked = candidates.filter((candidate) => candidate.recoveryCategory !== "DO_NOT_RECOVER");
  const avgScore =
    candidates.length > 0
      ? Math.round(candidates.reduce((sum, row) => sum + row.recoveryScore, 0) / candidates.length)
      : 0;

  return [
    {
      label: "current_snapshot",
      blockedCount: blocked.length,
      recoverableCount: recoverable.length,
      averageRecoveryScore: avgScore,
    },
  ];
}

export async function buildAutonomousRecoveryReport(): Promise<AutonomousRecoveryReport> {
  const warnings = [
    "P119 — intelligence layer only; no sends.",
    "P119 — no Breezy writes.",
    "P119 — no live mode activation.",
    "P119 — no runner wiring.",
  ];

  const [operations, paperworkReport, p109Records, mappingReport, operationalQueue, monitorState] =
    await Promise.all([
      buildAutonomousPaperworkOperationsCenterReport(),
      buildAutonomousPaperworkReport({ mode: "dryRun", mtdOnly: false }),
      loadP109ReviewRecords(),
      buildProjectMappingReport({ mode: "dryRun" }),
      buildP84OperationalQueueFromStores({ mtdOnly: false }),
      loadMonitorState().catch(() => null),
    ]);

  const mappingByCandidate = new Map(
    mappingReport.recommendations.map((rec) => [rec.candidateId, rec]),
  );
  const operationalByCandidate = new Map(
    operationalQueue.entries.map((entry) => [entry.candidateId, entry]),
  );
  const awaitingIds = new Set(
    Object.values(monitorState?.candidateTracking ?? {})
      .filter((entry) => entry.lastDropboxStatus === "awaiting_signature")
      .map((entry) => entry.candidateId),
  );

  const blockedCandidates = paperworkReport.candidates.filter(
    (candidate) => candidate.category === "blocked" || candidate.category === "sent",
  );

  const recoveryCandidates = blockedCandidates.map((candidate) => {
    const mapping = mappingByCandidate.get(candidate.candidateId);
    const operational = operationalByCandidate.get(candidate.candidateId);
    const record = findP109ReviewRecord(p109Records, candidate.candidateId);
    const approvalStatus = resolveMappingApprovalStatus({
      candidateId: candidate.candidateId,
      mappingDecision: mapping?.mappingDecision ?? "NO_MATCH",
      record,
    });
    const approvedMapping = resolveApprovedMapping({
      record,
      candidateId: candidate.candidateId,
      closedPositionId: candidate.positionId,
    });

    return buildRecoveryCandidateAnalysis({
      candidate,
      approvalStatus,
      approvedMapping,
      awaitingSignature: awaitingIds.has(candidate.candidateId),
      needsJobPublish: operational?.queueStatus === "needs_job_publish",
      mappingConfidence: mapping?.confidenceScore ?? approvedMapping?.confidenceScore ?? null,
      coverageDemandScore: mapping?.coverageDemandScore ?? 50,
      distanceMiles: mapping?.distanceMiles ?? null,
      duplicateRisk: candidate.blockerCategory === "duplicate_risk",
      alreadySent: candidate.blockerCategory === "already_sent" || candidate.category === "sent",
    });
  });

  const actionQueue = buildActionQueue(recoveryCandidates);
  const recoverableCandidates = recoveryCandidates.filter(
    (candidate) => candidate.estimatedUnlock > 0,
  );
  const impactSimulation = buildImpactSimulation({ actionQueue, recoverableCandidates });
  const recoveryDistribution = buildRecoveryDistribution(recoveryCandidates);
  const topOpportunities = buildTopOpportunities(recoveryCandidates);
  const largestBlockers = buildLargestBlockers(recoveryCandidates);
  const estimatedPaperworkUnlocked = recoverableCandidates.reduce(
    (sum, candidate) => sum + candidate.estimatedUnlock,
    0,
  );
  const estimatedRecruiterHoursSaved = estimateRecruiterHoursSaved(actionQueue);

  const topRecommendations = [
    ...actionQueue.slice(0, 5).map(
      (action) =>
        `${action.actionType} — unlock ${action.expectedUnlockCount} (${action.businessImpact} impact): ${action.reason}`,
    ),
    `Estimated paperwork unlocked if all recoverable: ${estimatedPaperworkUnlocked}.`,
    `Top 5 actions unlock: ${impactSimulation.top5.expectedPaperworkUnlocked}.`,
    `Top 10 actions unlock: ${impactSimulation.top10.expectedPaperworkUnlocked}.`,
  ];

  const goNoGo =
    operations.goNoGo === "GO" && operations.healthSummary.currentMode !== "live" ? "GO" : "NO-GO";
  const goNoGoReason =
    goNoGo === "GO"
      ? "Recovery intelligence ready — dry-run analysis complete with no live execution."
      : `Recovery analysis blocked: ${operations.goNoGoReason}`;

  const summary = [
    `P119 recovery engine — ${recoveryCandidates.length} blocked candidate(s) analyzed.`,
    `Recovery distribution: ${recoveryDistribution.map((entry) => `${entry.category}=${entry.count}`).join(", ")}.`,
    `Top opportunities: ${topOpportunities.length}; estimated unlock ${estimatedPaperworkUnlocked}; recruiter hours saved ${estimatedRecruiterHoursSaved}.`,
    `Top action: ${actionQueue[0]?.actionType ?? "none"} (priority ${actionQueue[0]?.priority ?? 0}).`,
    `${goNoGo}.`,
  ].join(" ");

  return {
    sourcePhase: P119_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P119_DEFAULT_MODE,
    summary,
    goNoGo,
    goNoGoReason,
    health: {
      currentMode: operations.healthSummary.currentMode,
      runnerScheduleEnabled: operations.healthSummary.runnerScheduleEnabled,
      lastRunAt: operations.healthSummary.lastRunAt,
      blockedCount: operations.healthSummary.blockedCount,
      readyToSend: operations.healthSummary.readyToSend,
    },
    recoveryDistribution,
    recoveryCandidates,
    actionQueue,
    topOpportunities,
    largestBlockers,
    executiveSummary: {
      highestImpactActions: actionQueue.slice(0, 10),
      topRecoveryOpportunities: topOpportunities,
      largestBlockers,
      estimatedPaperworkUnlocked,
      estimatedRecruiterHoursSaved,
      recoveryDistribution,
      recoveryTrend: buildRecoveryTrend(recoveryCandidates),
    },
    impactSimulation,
    topRecommendations,
    queueDepth: operations.queueDepth,
    warnings: [...warnings, ...operations.warnings],
  };
}
