import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  simulateP240CandidatePath,
  type P240OppPoint,
} from "@/lib/p240-autonomous-new-applicant-pipeline/simulate";
import {
  classifyP241QualificationFailure,
  deriveQualificationStatus,
} from "@/lib/p241-p65-qualification-forensics/classify";
import type { P241BlockedSeed } from "@/lib/p241-p65-qualification-forensics/load-cohort";
import { p241DisplayName, p241RedactId } from "@/lib/p241-p65-qualification-forensics/redact";
import { traceP65PromotionRules } from "@/lib/p241-p65-qualification-forensics/rule-trace";
import {
  P241_PHASE,
  type P241CandidateForensic,
  type P241GoNoGo,
  type P241ThroughputSimulation,
} from "@/lib/p241-p65-qualification-forensics/types";

/** Mirror P240 replay, then clear stale action fields (the proposed safe correction). */
export function buildP240ReplayWorkflow(
  workflow: CandidateWorkflowRecord | undefined,
  candidateId: string,
): CandidateWorkflowRecord {
  const base: CandidateWorkflowRecord = workflow
    ? { ...workflow }
    : {
        candidateId,
        workflowStatus: "Applied",
        assignedRecruiter: "Unassigned",
        assignedDM: "Unassigned",
        notes: [],
        history: [],
        lastActionAt: null,
        nextActionNeeded: "Review",
        recruitingActions: emptyRecruitingActions(),
        followUpDueAt: null,
        snoozedUntil: null,
        paperworkStatus: "not_sent",
        signatureRequestId: null,
        paperworkTemplateKey: null,
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkViewCount: 0,
        paperworkSignedAt: null,
        paperworkError: null,
        onboardingContactEmail: null,
        directDepositStatus: "not_requested",
        directDepositRequestedAt: null,
        directDepositLastReminderAt: null,
        directDepositNotes: null,
        directDepositTriggeredByUserId: null,
        directDepositLastDeliveryMode: null,
        directDepositLastHrCopyIncluded: null,
        directDepositLastHrBccAddress: null,
        updatedAt: new Date().toISOString(),
      };

  return {
    ...base,
    workflowStatus: "Applied",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkSentAt: null,
    paperworkSignedAt: null,
    paperworkViewedAt: null,
    paperworkError: null,
    assignedDM: "Unassigned",
    // Intentionally retains actionType — matches P240 bug.
  };
}

export function applyFixedReplayClear(workflow: CandidateWorkflowRecord): CandidateWorkflowRecord {
  // Mirrors P242 / applyP240FreshNewReplayReset action clears (forensic projection only).
  return {
    ...workflow,
    actionType: null,
    requiredAction: null,
    actionReason: null,
    actionDueDate: null,
    actionGeneratedAt: null,
    actionPriority: null,
    actionConfidence: null,
    nextActionNeeded: "Review",
    lastActionAt: null,
    recommendedStage: null,
    progressionReason: null,
    progressionConfidence: null,
    progressionPriority: null,
    progressionGeneratedAt: null,
  };
}

export function buildP241CandidateForensic(input: {
  seed: P241BlockedSeed;
  candidate: BreezyCandidate | undefined;
  workflow: CandidateWorkflowRecord | undefined;
  policy: CandidateOnboardingPolicy;
}): P241CandidateForensic {
  const policy: CandidateOnboardingPolicy = {
    ...input.policy,
    funnelPromotion: { enabled: true },
  };
  const candidate = input.candidate;
  const workflow = input.workflow;
  const displayName = candidate
    ? p241DisplayName({
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        candidateId: input.seed.candidateId,
      })
    : input.seed.displayName;

  const currentRow = candidate
    ? buildScoredWorkflowRow(candidate, workflow)
    : null;
  const replayWf = buildP240ReplayWorkflow(workflow, input.seed.candidateId);
  const projectedReplay: CandidateWorkflowRecord = {
    ...replayWf,
    assignedRecruiter: String(
      workflow?.assignedRecruiter && workflow.assignedRecruiter !== "Unassigned"
        ? workflow.assignedRecruiter
        : input.seed.assignedRecruiter,
    ),
    assignedDM: String(input.seed.assignedDM || "Unassigned"),
    workflowStatus: "Applied",
  };
  const replayRow = candidate ? buildScoredWorkflowRow(candidate, projectedReplay) : null;
  const fixedWf = applyFixedReplayClear(projectedReplay);
  const fixedRow = candidate ? buildScoredWorkflowRow(candidate, fixedWf) : null;

  if (!currentRow || !replayRow || !fixedRow) {
    throw new Error(`P241: missing ingestion candidate for ${input.seed.candidateId}`);
  }

  const currentStateTrace = traceP65PromotionRules(currentRow, policy, "current_state");
  const p240ReplayTrace = traceP65PromotionRules(replayRow, policy, "p240_replay");
  const fixedReplayTrace = traceP65PromotionRules(fixedRow, policy, "fixed_replay");

  const classified = classifyP241QualificationFailure({
    currentStateTrace,
    p240ReplayTrace,
    fixedReplayTrace,
    workflowStage: String(workflow?.workflowStatus ?? "NO_WORKFLOW"),
    paperworkStatus: String(workflow?.paperworkStatus ?? "not_sent"),
    actionType: workflow?.actionType ?? null,
  });

  return {
    candidateId: input.seed.candidateId,
    redactedCandidateId: input.seed.redactedCandidateId || p241RedactId(input.seed.candidateId),
    displayName,
    appliedDate: input.seed.appliedDate ?? candidate?.appliedDate ?? candidate?.addedDate ?? null,
    positionId: candidate?.positionId ?? null,
    positionName: candidate?.positionName ?? null,
    assignedRecruiter: String(workflow?.assignedRecruiter ?? input.seed.assignedRecruiter),
    assignedDM: String(workflow?.assignedDM ?? input.seed.assignedDM),
    workflowStage: String(workflow?.workflowStatus ?? input.seed.workflowStage),
    breezyStage: candidate?.stage ?? null,
    paperworkStatus: String(workflow?.paperworkStatus ?? "not_sent"),
    signatureRequestIdPresent: Boolean(String(workflow?.signatureRequestId ?? "").trim()),
    actionType: workflow?.actionType ?? null,
    aiGrade: String(currentRow.aiGrade),
    qualificationStatus: deriveQualificationStatus({
      aiGrade: String(currentRow.aiGrade),
      workflowStage: String(workflow?.workflowStatus ?? ""),
      paperworkStatus: String(workflow?.paperworkStatus ?? ""),
      currentCanPromote: currentStateTrace.canPromote,
      replayCanPromote: p240ReplayTrace.canPromote,
    }),
    p240Blocker: input.seed.blocker,
    p240BlockerDetail: input.seed.blockerDetail,
    currentStateTrace,
    p240ReplayTrace,
    fixedReplayTrace,
    failedRule: classified.failedRule,
    failedCheckId: classified.failedCheckId,
    failedCheckDetail: classified.failedCheckDetail,
    source: classified.source,
    classification: classified.classification,
    recoverability: classified.recoverability,
    expectedOrUnintended: classified.expectedOrUnintended,
    rootCause: classified.rootCause,
    smallestSafeCorrection: classified.smallestSafeCorrection,
    projectedOutcomeIfRecovered: "not_applicable",
    projectedBlockerIfStillBlocked: null,
    projectedNearestMiles: null,
    projectedCoverageTier: null,
  };
}

/**
 * Simulate post-recovery path (clear actionType on P240 replay) — still read-only.
 */
export async function projectP241RecoveryPath(input: {
  forensic: P241CandidateForensic;
  candidate: BreezyCandidate;
  workflow: CandidateWorkflowRecord | undefined;
  job: BreezyJob | null;
  policy: CandidateOnboardingPolicy;
  opportunityPoints: P240OppPoint[];
  allowNetworkGeocode?: boolean;
}): Promise<P241CandidateForensic> {
  const fixedWorkflow = applyFixedReplayClear(
    buildP240ReplayWorkflow(input.workflow, input.forensic.candidateId),
  );
  // Keep recruiter ownership for continuity (same as P240 replay).
  if (input.workflow && input.workflow.assignedRecruiter) {
    fixedWorkflow.assignedRecruiter = input.workflow.assignedRecruiter;
  }

  const trace = await simulateP240CandidatePath({
    candidateId: input.forensic.candidateId,
    candidate: input.candidate,
    workflow: fixedWorkflow,
    job: input.job,
    policy: { ...input.policy, funnelPromotion: { enabled: true } },
    opportunityPoints: input.opportunityPoints,
    priorSent: new Set(),
    proposedRecruiter: String(
      input.workflow?.assignedRecruiter && input.workflow.assignedRecruiter !== "Unassigned"
        ? input.workflow.assignedRecruiter
        : input.forensic.assignedRecruiter,
    ),
    recruiterConfidence: 100,
    emailOwners: new Map(),
    cohortKind: "simulation_proxy_24h",
    replayAsFreshNew: true,
    allowNetworkGeocode: input.allowNetworkGeocode ?? false,
  });

  const outcome =
    trace.outcome === "would_send"
      ? "would_send"
      : trace.outcome === "would_reach_paperwork_needed"
        ? "would_reach_paperwork_needed"
        : "still_blocked";

  return {
    ...input.forensic,
    projectedOutcomeIfRecovered: outcome,
    projectedBlockerIfStillBlocked: outcome === "still_blocked" ? trace.blocker : null,
    projectedNearestMiles: trace.nearestMiles,
    projectedCoverageTier: trace.coverageTier,
  };
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function projectHealth(input: {
  autoClearRatePct: number;
  topBlockerPctOfBlocked: number;
  arrivalsLast14Days: number;
  estimatedDailyArrivalRate: number;
}): { healthScore: number; grade: string; goNoGo: P241GoNoGo; goNoGoReason: string } {
  const autoClearScore = Math.min(100, input.autoClearRatePct);
  const explicitBlockerScore = 100;
  const neverResendScore = 100;
  const ingestionCoverageScore = input.arrivalsLast14Days > 0 ? 90 : 70;
  const bottleneckPenalty =
    input.topBlockerPctOfBlocked > 40 ? 25 : input.topBlockerPctOfBlocked > 20 ? 10 : 0;
  const bottleneckScore = Math.max(0, 100 - bottleneckPenalty * 2);

  const healthScore = Math.round(
    autoClearScore * 0.35 +
      explicitBlockerScore * 0.2 +
      neverResendScore * 0.15 +
      ingestionCoverageScore * 0.15 +
      bottleneckScore * 0.15,
  );

  const grade =
    healthScore >= 90 ? "A" : healthScore >= 80 ? "B" : healthScore >= 70 ? "C" : healthScore >= 55 ? "D" : "F";

  let goNoGo: P241GoNoGo;
  let goNoGoReason: string;
  if (healthScore >= 85 && input.autoClearRatePct >= 70) {
    goNoGo = "GO_WITH_CONDITIONS";
    goNoGoReason =
      "Projected health and auto-clear clear continuous dry-run thresholds, but live unattended mode still needs supervised canary + send caps.";
  } else if (healthScore >= 70) {
    goNoGo = "GO_WITH_CONDITIONS";
    goNoGoReason =
      "Projected pipeline is decision-complete with improved auto-clear, but remaining blockers (distance review / data quality) prevent full GO.";
  } else {
    goNoGo = "NO-GO";
    goNoGoReason = `Projected health ${healthScore}/100 with auto-clear ${input.autoClearRatePct}% remains below continuous operation thresholds.`;
  }

  // Absolute: forensics never authorizes unattended GO.
  if (goNoGo === "GO") goNoGo = "GO_WITH_CONDITIONS";

  return { healthScore, grade, goNoGo, goNoGoReason };
}

export function buildP241ThroughputSimulation(input: {
  forensics: P241CandidateForensic[];
  baselineWouldSend: number;
  baselineBlocked: number;
  proxyCohortSize: number;
  estimatedDailyArrivalRate: number;
  arrivalsLast14Days: number;
  baselineHealthScore: number;
  baselineAutoClearRatePct: number;
  remainingNonQualificationBlockers: Array<{ blocker: string; count: number }>;
  generatedAt?: string;
}): P241ThroughputSimulation {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const unlocks = input.forensics.filter((f) => f.projectedOutcomeIfRecovered === "would_send");
  const stillBlockedAfter = input.forensics.filter(
    (f) => f.projectedOutcomeIfRecovered === "still_blocked",
  );

  const wouldSendDelta = unlocks.length;
  const wouldSendCount = input.baselineWouldSend + wouldSendDelta;
  const blockedCount =
    input.baselineBlocked - input.forensics.length + stillBlockedAfter.length;
  const autoClearRatePct = pct(wouldSendCount, input.proxyCohortSize);
  const clearFraction = input.proxyCohortSize > 0 ? wouldSendCount / input.proxyCohortSize : 0;
  const estimatedDailyThroughputToSent =
    Math.round(input.estimatedDailyArrivalRate * clearFraction * 10) / 10;

  const remainingCounts = new Map<string, number>();
  for (const b of input.remainingNonQualificationBlockers) {
    remainingCounts.set(b.blocker, (remainingCounts.get(b.blocker) ?? 0) + b.count);
  }
  for (const f of stillBlockedAfter) {
    const code = f.projectedBlockerIfStillBlocked ?? "still_blocked";
    remainingCounts.set(code, (remainingCounts.get(code) ?? 0) + 1);
  }
  const remainingBottlenecks = [...remainingCounts.entries()]
    .map(([blocker, count]) => ({
      blocker,
      count,
      pct: pct(count, Math.max(1, blockedCount)),
    }))
    .sort((a, b) => b.count - a.count);

  const topPct = remainingBottlenecks[0]?.pct ?? 0;
  const projected = projectHealth({
    autoClearRatePct,
    topBlockerPctOfBlocked: topPct,
    arrivalsLast14Days: input.arrivalsLast14Days,
    estimatedDailyArrivalRate: input.estimatedDailyArrivalRate,
  });

  return {
    phase: P241_PHASE,
    generatedAt,
    baseline: {
      proxyCohortSize: input.proxyCohortSize,
      wouldSendCount: input.baselineWouldSend,
      blockedCount: input.baselineBlocked,
      autoClearRatePct: input.baselineAutoClearRatePct,
      estimatedDailyThroughputToSent:
        Math.round(
          input.estimatedDailyArrivalRate *
            (input.baselineWouldSend / Math.max(1, input.proxyCohortSize)) *
            10,
        ) / 10,
      healthScore: input.baselineHealthScore,
      goNoGo: "NO-GO",
    },
    projectedAfterRecoverableFixes: {
      recoverableQualificationFailures: unlocks.length,
      wouldSendDelta,
      wouldSendCount,
      blockedCount,
      autoClearRatePct,
      estimatedDailyThroughputToSent,
      estimatedDailyArrivalRate: input.estimatedDailyArrivalRate,
      healthScore: projected.healthScore,
      grade: projected.grade,
      goNoGo: projected.goNoGo,
      goNoGoReason: projected.goNoGoReason,
      remainingBottlenecks: remainingBottlenecks.map(
        (b) => `${b.blocker} (${b.count}, ${b.pct}%)`,
      ),
    },
    assumptions: [
      "Recovery = clear stale actionType/requiredAction on P240 replayAsFreshNew only (simulation measurement fix).",
      "Does not mutate live candidates, re-send paperwork, or bypass active-packet / never-resend rules.",
      "Proximity/DM gates re-evaluated with same P240 opportunity + position authority inputs.",
      "Non-qualification P240 blockers (manual_review_40_60, duplicate_identity, missing_phone) remain.",
    ],
  };
}
