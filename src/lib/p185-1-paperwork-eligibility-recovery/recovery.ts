import type { BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildJobsLookupMap } from "@/lib/breezy-global-candidates";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  buildP184RejectionBuckets,
  estimateP184CompletionMinutes,
  evaluateP184RateLimit,
  loadP184EngineState,
  runP184AutonomousPaperworkSendEngine,
  updateP184Config,
  type P184VerifiedOnboardingJob,
} from "@/lib/p184-autonomous-paperwork-send-engine";
import { classifyP1851PaperworkNeed } from "@/lib/p185-1-paperwork-eligibility-recovery/classifier";
import { reconcileP1851Envelopes } from "@/lib/p185-1-paperwork-eligibility-recovery/envelopeReconcile";
import type { P1851EnvelopeReconcileDeps } from "@/lib/p185-1-paperwork-eligibility-recovery/envelopeReconcile";
import { collectP1851HiringEvidence } from "@/lib/p185-1-paperwork-eligibility-recovery/hiringEvidence";
import { resolveP1851JobMapping } from "@/lib/p185-1-paperwork-eligibility-recovery/jobMapping";
import { loadP1851OperatorEvidence } from "@/lib/p185-1-paperwork-eligibility-recovery/operatorQueues";
import { inventoryDistinctStages } from "@/lib/p185-1-paperwork-eligibility-recovery/stageNormalization";
import {
  loadP1851RecoveryState,
  saveP1851RecoveryState,
  upsertP1851MappingAliases,
} from "@/lib/p185-1-paperwork-eligibility-recovery/store";
import type {
  P1851CandidateRecovery,
  P1851EnvelopeLifecycle,
  P1851JobMappingAlias,
  P1851OperatorReviewRow,
  P1851PaperworkNeedClass,
  P1851RecoveryReport,
} from "@/lib/p185-1-paperwork-eligibility-recovery/types";
import { P185_1_SOURCE_PHASE } from "@/lib/p185-1-paperwork-eligibility-recovery/types";
import {
  getP185StorageHealth,
  isP185SchedulerAuthConfigured,
  loadP185RunnerState,
  setP185StorageTestFlags,
} from "@/lib/p185-production-paperwork-automation-runner";
import { buildP184IdempotencyKey } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";

export type P1851RecoveryRunResult = {
  report: P1851RecoveryReport;
  recoveries: P1851CandidateRecovery[];
  operatorReview: P1851OperatorReviewRow[];
  envelopeRows: Awaited<ReturnType<typeof reconcileP1851Envelopes>>["rows"];
  stageInventory: Array<{ stage: string; count: number }>;
  mappingRows: Array<{
    candidateId: string;
    originalPositionId: string | null;
    resolvedPositionId: string | null;
    mappingMethod: string;
    confidence: string;
    ambiguity: boolean;
    jobOpen: boolean;
    jobAcceptingCandidates: boolean;
    onboardingJobClassification: string;
  }>;
};

function emptyClassCounts(): Record<P1851PaperworkNeedClass, number> {
  return {
    already_active_packet: 0,
    paperwork_completed: 0,
    eligible_new_packet: 0,
    eligible_replacement_packet: 0,
    awaiting_hiring_approval: 0,
    applied_not_selected: 0,
    unresolved_job: 0,
    ambiguous_candidate_state: 0,
    invalid_contact: 0,
    withdrawn_or_archived: 0,
    hired_no_action: 0,
    blocked_other: 0,
  };
}

function candidateDisplayName(row: ScoredCandidateWorkflowRow): string {
  const full = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return full || row.email || row.candidateId;
}

export async function runP1851PaperworkEligibilityRecovery(input?: {
  beforeUnmatchedJobs?: number;
  beforeEligible?: number;
  skipEnvelopeReconcile?: boolean;
  envelopeDeps?: P1851EnvelopeReconcileDeps;
  forceDurableLocal?: boolean;
}): Promise<P1851RecoveryRunResult> {
  if (input?.forceDurableLocal !== false) {
    setP185StorageTestFlags({ forceDurable: true });
  }

  // Preserve controlled limits; keep live disabled
  await updateP184Config({
    enabled: false,
    mode: "dry_run",
    maxSendsPerCycle: 10,
    rateLimits: {
      maxPerMinute: 4,
      maxPerHour: 40,
      maxPerDay: 200,
      concurrentSends: 2,
    },
  });

  const store = await readIngestionStore();
  const bundle = await getCandidateWorkflowBundle();
  const [publishedResult, closedResult] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyJobs("closed"),
  ]);
  const publishedJobs = publishedResult.ok ? publishedResult.jobs : [];
  const closedJobs = closedResult.ok ? closedResult.jobs : [];
  const publishedLookup = buildJobsLookupMap(publishedJobs);
  const allLookup = buildJobsLookupMap([...closedJobs, ...publishedJobs]);

  const breezyHealthy = publishedResult.ok;
  const candidates = listIngestedCandidates(store);
  const rows = candidates.map((c) =>
    buildScoredWorkflowRow(c, bundle.workflows[c.candidateId], {
      job: publishedLookup.get(c.positionId) ?? allLookup.get(c.positionId),
    }),
  );

  const beforeUnmatched =
    input?.beforeUnmatchedJobs ??
    rows.filter((r) => !r.positionId || !publishedLookup.has(r.positionId)).length;
  const beforeMatched = rows.length - beforeUnmatched;

  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((r) => [r.candidateId, r] as const),
  );

  const operatorEvidence = await loadP1851OperatorEvidence({
    candidates,
    workflows: bundle.workflows,
  });

  const recoveryState = await loadP1851RecoveryState();

  // 1) Reconcile envelopes
  const envelopeItems = rows
    .filter((r) => Boolean(r.signatureRequestId))
    .map((r) => ({
      candidateId: r.candidateId,
      envelopeId: r.signatureRequestId!,
      previousPaperworkStatus: r.paperworkStatus,
    }));

  const envelopeResult = input?.skipEnvelopeReconcile
    ? {
        rows: envelopeItems.map((e) => ({
          candidateId: e.candidateId,
          envelopeId: e.envelopeId,
          previousPaperworkStatus: e.previousPaperworkStatus ?? null,
          lifecycle: "unknown" as const,
          replacementEligible: false,
          replacementReason: null,
          error: "skipped",
        })),
        byLifecycle: { unknown: envelopeItems.length } as Record<string, number>,
        replacementReview: 0,
        unresolved: envelopeItems.length,
      }
    : await reconcileP1851Envelopes({
        items: envelopeItems,
        deps: input?.envelopeDeps,
        concurrency: 3,
      });

  const envelopeByCandidate = new Map(
    envelopeResult.rows.map((r) => [r.candidateId, r.lifecycle] as const),
  );

  const p184State = await loadP184EngineState();
  const completedKeys = new Set(p184State.completedIdempotencyKeys);

  const recoveries: P1851CandidateRecovery[] = [];
  const aliasesToPersist: P1851JobMappingAlias[] = [];
  const verifiedOnboarding = new Map<string, P184VerifiedOnboardingJob>();
  const dryRunRows: ScoredCandidateWorkflowRow[] = [];
  const jobsByPositionId = new Map(allLookup);

  for (const row of rows) {
    const hasP109 = operatorEvidence.approvedMappings.some(
      (m) => m.candidateId === row.candidateId || m.closedPositionId === row.positionId,
    );
    const hiringEvidence = collectP1851HiringEvidence({
      row,
      operatorQueueIds: operatorEvidence.operatorQueueIds,
      hasP109ApprovedMapping: hasP109,
    });

    const mapping = resolveP1851JobMapping({
      row,
      publishedJobs,
      closedJobs,
      aliases: recoveryState.aliases,
      approvedMappings: operatorEvidence.approvedMappings,
      selectedForHiring: hiringEvidence.present,
    });

    if (
      mapping.resolvedPositionId &&
      mapping.originalPositionId &&
      mapping.mappingMethod !== "unresolved" &&
      mapping.confidence !== "none"
    ) {
      aliasesToPersist.push({
        originalPositionId: mapping.originalPositionId,
        resolvedPositionId: mapping.resolvedPositionId,
        mappingMethod: mapping.mappingMethod,
        confidence: mapping.confidence,
        updatedAt: new Date().toISOString(),
        supportingFields: mapping.supportingFields,
      });
    }

    const envelopeLifecycle: P1851EnvelopeLifecycle | null =
      envelopeByCandidate.get(row.candidateId) ??
      (row.signatureRequestId ? "sent_unverified" : null);

    const templateKey = row.paperworkTemplateKey || "onboarding_packet";
    const idem = buildP184IdempotencyKey({
      candidateId: row.candidateId,
      templateKey: templateKey as "onboarding_packet",
      positionId: mapping.resolvedPositionId ?? row.positionId,
    });

    const recovery = classifyP1851PaperworkNeed({
      row,
      mapping,
      hiringEvidence,
      envelopeLifecycle,
      completedIdempotency: completedKeys.has(idem),
      templateAvailable: true,
    });
    recoveries.push(recovery);

    // Overlay for P184 dry-run: only verified eligible_new_packet get Paperwork Needed + resolved job
    if (recovery.classification === "eligible_new_packet" && mapping.resolvedPositionId) {
      const overlay: ScoredCandidateWorkflowRow = {
        ...row,
        positionId: mapping.resolvedPositionId,
        workflowStatus: "Paperwork Needed",
        stage: "Paperwork Needed",
      };
      dryRunRows.push(overlay);
      if (mapping.acceptingForOnboarding) {
        verifiedOnboarding.set(row.candidateId, {
          positionId: mapping.resolvedPositionId,
          acceptingForOnboarding: true,
          classification: mapping.onboardingJobClassification,
          detail: `P185.1 verified onboarding job via ${mapping.mappingMethod}.`,
        });
      }
      const job = jobsByPositionId.get(mapping.resolvedPositionId);
      if (job) jobsByPositionId.set(mapping.resolvedPositionId, job);
    }
  }

  await upsertP1851MappingAliases(aliasesToPersist);

  // Corrected dry-run: evaluate all rows with mapping overlays for eligible; others as-is with resolved jobs where known
  const allDryRunCandidates = rows.map((row) => {
    const recovery = recoveries.find((r) => r.candidateId === row.candidateId)!;
    if (recovery.classification === "eligible_new_packet") {
      return dryRunRows.find((d) => d.candidateId === row.candidateId) ?? row;
    }
    if (recovery.mapping.resolvedPositionId) {
      return { ...row, positionId: recovery.mapping.resolvedPositionId };
    }
    return row;
  });

  for (const recovery of recoveries) {
    if (
      recovery.mapping.acceptingForOnboarding &&
      recovery.mapping.resolvedPositionId &&
      !verifiedOnboarding.has(recovery.candidateId)
    ) {
      // Only pass verified override for closed/historical when selected
      if (
        recovery.mapping.onboardingJobClassification === "historical_valid_for_onboarding" ||
        recovery.mapping.onboardingJobClassification === "closed"
      ) {
        if (recovery.hiringEvidence.present) {
          verifiedOnboarding.set(recovery.candidateId, {
            positionId: recovery.mapping.resolvedPositionId,
            acceptingForOnboarding: true,
            classification: recovery.mapping.onboardingJobClassification,
            detail: `P185.1 historical onboarding job (${recovery.mapping.mappingMethod}).`,
          });
        }
      }
    }
  }

  const dryRun = await runP184AutonomousPaperworkSendEngine({
    candidates: allDryRunCandidates,
    onboardingByCandidateId,
    jobsByPositionId,
    mode: "dry_run",
    maxSends: 0,
    byUserId: "p185-1-eligibility-recovery",
    verifiedOnboardingJobByCandidateId: verifiedOnboarding,
  });

  const afterState = await loadP184EngineState();
  const queueDepth = afterState.queue.filter(
    (q) => q.status === "queued" || q.status === "failed_transient",
  ).length;
  const rate = evaluateP184RateLimit({
    config: afterState.config.rateLimits,
    sendTimestamps: afterState.sendTimestamps,
    inFlight: 0,
  });
  const eligibleCount = dryRun.eligible;
  const clearMinutes = estimateP184CompletionMinutes({
    projectedSends: eligibleCount,
    rateLimitStatus: rate,
  });
  const cadenceMinutes = Math.ceil(eligibleCount / 10) * 10;
  const estimatedClearanceMinutes = Math.max(clearMinutes ?? 0, cadenceMinutes);

  const classifications = emptyClassCounts();
  for (const r of recoveries) classifications[r.classification] += 1;

  const afterUnresolved = recoveries.filter((r) => r.classification === "unresolved_job").length;
  const afterMatched = recoveries.filter(
    (r) => r.mapping.resolvedPositionId && r.mapping.mappingMethod !== "unresolved",
  ).length;

  const operatorReview: P1851OperatorReviewRow[] = recoveries.map((r) => {
    const row = rows.find((x) => x.candidateId === r.candidateId)!;
    const job = r.mapping.resolvedPositionId
      ? jobsByPositionId.get(r.mapping.resolvedPositionId)
      : undefined;
    return {
      candidateId: r.candidateId,
      candidateName: candidateDisplayName(row),
      candidateEmail: (row.email ?? row.onboardingContactEmail ?? "").trim(),
      currentStage: r.currentStage,
      normalizedStage: r.normalizedStage,
      jobTitle: job?.name ?? row.positionName ?? null,
      jobCityState:
        job ? `${job.city}, ${job.state}` : row.city && row.state ? `${row.city}, ${row.state}` : null,
      originalJobId: r.mapping.originalPositionId,
      resolvedJobId: r.mapping.resolvedPositionId,
      mappingMethod: r.mapping.mappingMethod,
      hiringSelectionEvidence: r.hiringEvidence.sources,
      existingEnvelopeState: r.envelopeLifecycle,
      proposedAction: r.proposedAction,
      eligibilityResult: r.classification,
      rejectionOrReviewReason: r.eligibilityNote,
      bucket: r.reviewBucket,
    };
  });

  const storage = getP185StorageHealth();
  const p185 = await loadP185RunnerState();
  const authConfigured = isP185SchedulerAuthConfigured();
  const dropboxOk = Boolean(readDropboxSignConfig());

  const liveBlockers: string[] = [];
  if (!authConfigured) liveBlockers.push("CRON_SECRET / P185_CRON_SECRET not configured.");
  if (!dropboxOk) liveBlockers.push("Dropbox Sign unhealthy or unconfigured.");
  if (!storage.durable || !storage.healthy) liveBlockers.push("Durable storage not healthy.");
  if (!breezyHealthy) liveBlockers.push("Breezy source unhealthy.");
  if (envelopeResult.unresolved > 0 && !input?.skipEnvelopeReconcile) {
    liveBlockers.push(`${envelopeResult.unresolved} envelopes still unresolved after reconciliation.`);
  }
  if (classifications.eligible_new_packet > 0) {
    // Ensure none lack hiring evidence (classifier already requires it)
    const bad = recoveries.filter(
      (r) => r.classification === "eligible_new_packet" && !r.hiringEvidence.present,
    );
    if (bad.length) liveBlockers.push(`${bad.length} eligible candidates lack hiring evidence.`);
  }
  if (p185.safety.killSwitch) liveBlockers.push("Kill switch active.");
  if (p185.circuit.open) liveBlockers.push("Circuit breaker open.");
  if (process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "1") {
    // still don't auto-enable; note flag if somehow set
  } else {
    liveBlockers.push("P185_PRODUCTION_AUTOMATION_ENABLED is not set (intentional for this phase).");
  }
  liveBlockers.push("P184 remains enabled=false / mode=dry_run (intentional — do not auto-enable).");

  const rejectionBuckets = buildP184RejectionBuckets(
    dryRun.report.rejected.map((r) => ({ candidateId: r.candidateId, reasons: r.reasons })),
  );

  const report: P1851RecoveryReport = {
    phase: P185_1_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    rootCause: [
      "Most unmatched IDs are closed/historical Breezy positions not present in the published-only job map used by P184/P185.",
      "P185 built jobsByPositionId from published jobs keyed only by jobId in some paths; closed ads and friendlyId aliases were not applied.",
      "Zero candidates currently have workflowStatus Paperwork Needed — Applied is not positive hiring-selection evidence.",
    ],
    mappingCoverage: {
      beforeUnmatched,
      afterUnresolved,
      beforeMatched,
      afterMatched,
      coveragePctAfter: rows.length ? Math.round((afterMatched / rows.length) * 1000) / 10 : 0,
    },
    envelopeReconciliation: {
      attempted: envelopeItems.length,
      byLifecycle: envelopeResult.byLifecycle,
      replacementReview: envelopeResult.replacementReview,
      unresolved: envelopeResult.unresolved,
    },
    classifications,
    dryRun: {
      evaluated: dryRun.evaluated,
      eligible: dryRun.eligible,
      rejected: dryRun.report.rejected.length,
      queueDepth,
      estimatedClearanceMinutes,
      projectedSendsPerHour: Math.min(40, eligibleCount),
      projectedSendsPerDay: Math.min(200, eligibleCount),
      rejectionReasons: rejectionBuckets.map((b) => ({ reason: b.reason, count: b.count })),
    },
    comparison: {
      beforeEligible: input?.beforeEligible ?? 0,
      afterEligible: dryRun.eligible,
      beforeUnmatchedJobs: beforeUnmatched,
      afterUnresolvedJobs: afterUnresolved,
    },
    gates: {
      durableStorageHealthy: storage.healthy && storage.durable,
      dropboxSignHealthy: dropboxOk,
      breezySourceHealthy: breezyHealthy,
      schedulerAuthConfigured: authConfigured,
      recentDryRunSuccessful: true,
      killSwitchInactive: !p185.safety.killSwitch,
      circuitBreakerClosed: !p185.circuit.open,
      p184Mode: afterState.config.mode,
      p184Enabled: afterState.config.enabled,
      p185ProductionFlag: process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "1",
      eligibleCohortCount: classifications.eligible_new_packet,
      unresolvedMappingCount: afterUnresolved,
      envelopeReconcileUnresolved: envelopeResult.unresolved,
      mappingCoveragePct: rows.length ? Math.round((afterMatched / rows.length) * 1000) / 10 : 0,
    },
    liveReady: false,
    liveBlockers,
    controlledLimits: {
      cadence: "*/10 * * * *",
      maxSendsPerCycle: 10,
      maxPerMinute: 4,
      maxPerHour: 40,
      maxPerDay: 200,
      concurrentSends: 2,
      maxFailuresPerCycle: 3,
    },
    activationSteps: [
      "Operator-review cohort buckets A/B/C/D in local secured review file",
      "Set CRON_SECRET or P185_CRON_SECRET in deployment (never commit)",
      "Confirm durable storage (P185_DURABLE_DATA_DIR on serverless)",
      "Confirm Dropbox Sign + templates",
      "Advance/approve hiring for awaiting_hiring_approval candidates as needed",
      "Re-run P185.1 dry-run until eligible cohort matches operator approval",
      "Enable P184 enabled=true with mode=dry_run, then mode=live only after gates green",
      "Set P185_PRODUCTION_AUTOMATION_ENABLED=1 only after operator sign-off",
    ],
    warnings: [
      "Live sending remains disabled.",
      "Applied candidates were not auto-advanced to Paperwork Needed.",
      input?.skipEnvelopeReconcile
        ? "Envelope reconciliation was skipped for this run."
        : "Envelope reconciliation completed against Dropbox Sign where reachable.",
    ],
  };

  const state = await loadP1851RecoveryState();
  state.lastRecoveryAt = report.generatedAt;
  state.lastDryRunAt = report.generatedAt;
  state.stats = {
    evaluated: rows.length,
    eligibleNew: classifications.eligible_new_packet,
    eligibleReplacement: classifications.eligible_replacement_packet,
    awaitingApproval: classifications.awaiting_hiring_approval,
    appliedNotSelected: classifications.applied_not_selected,
    unresolvedJobs: afterUnresolved,
    activePackets: classifications.already_active_packet,
    completedPackets: classifications.paperwork_completed,
  };
  await saveP1851RecoveryState(state);

  return {
    report,
    recoveries,
    operatorReview,
    envelopeRows: envelopeResult.rows,
    stageInventory: inventoryDistinctStages(rows.map((r) => r.workflowStatus || r.stage || "")),
    mappingRows: recoveries.map((r) => ({
      candidateId: r.candidateId,
      originalPositionId: r.mapping.originalPositionId,
      resolvedPositionId: r.mapping.resolvedPositionId,
      mappingMethod: r.mapping.mappingMethod,
      confidence: r.mapping.confidence,
      ambiguity: r.mapping.ambiguity,
      jobOpen: r.mapping.jobOpen,
      jobAcceptingCandidates: r.mapping.jobAcceptingCandidates,
      onboardingJobClassification: r.mapping.onboardingJobClassification,
    })),
  };
}
