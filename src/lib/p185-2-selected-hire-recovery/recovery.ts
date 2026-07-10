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
  buildP184IdempotencyKey,
  buildP184RejectionBuckets,
  loadP184EngineState,
  runP184AutonomousPaperworkSendEngine,
  updateP184Config,
  type P184VerifiedOnboardingJob,
} from "@/lib/p184-autonomous-paperwork-send-engine";
import { saveP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { resolveP1851JobMapping } from "@/lib/p185-1-paperwork-eligibility-recovery/jobMapping";
import { loadP1851RecoveryState } from "@/lib/p185-1-paperwork-eligibility-recovery/store";
import type { P1851EnvelopeLifecycle } from "@/lib/p185-1-paperwork-eligibility-recovery/types";
import { loadP1852SelectionEvidenceIndex } from "@/lib/p185-2-selected-hire-recovery/evidenceSources";
import { projectP1852ControlledRollout } from "@/lib/p185-2-selected-hire-recovery/projection";
import { resolveP1852Selection } from "@/lib/p185-2-selected-hire-recovery/selectionResolver";
import { loadP1852State, saveP1852State } from "@/lib/p185-2-selected-hire-recovery/store";
import { resolveP1852TemplateReadiness } from "@/lib/p185-2-selected-hire-recovery/templateReadiness";
import type {
  P1852NormalizationRecord,
  P1852OperatorReviewRow,
  P1852RecoveryReport,
  P1852SelectionResolution,
  P1852TemplateReadiness,
} from "@/lib/p185-2-selected-hire-recovery/types";
import { P185_2_OPERATOR, P185_2_SOURCE_PHASE } from "@/lib/p185-2-selected-hire-recovery/types";
import {
  getP185StorageHealth,
  isP185SchedulerAuthConfigured,
  loadP185RunnerState,
  setP185StorageTestFlags,
} from "@/lib/p185-production-paperwork-automation-runner";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

export type P1852RecoveryRunResult = {
  report: P1852RecoveryReport;
  resolutions: P1852SelectionResolution[];
  operatorReview: P1852OperatorReviewRow[];
  normalizations: P1852NormalizationRecord[];
  templates: P1852TemplateReadiness[];
  evidenceSummary: {
    authoritativeCandidateIds: string[];
    p181: string[];
    p83Executed: string[];
    p97: string[];
    p158: string[];
  };
};

function displayName(row: ScoredCandidateWorkflowRow): string {
  const full = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return full || row.email || row.candidateId;
}

function envelopeFromRow(row: ScoredCandidateWorkflowRow): P1851EnvelopeLifecycle | null {
  if (row.paperworkStatus === "signed") return "signed";
  if (row.paperworkStatus === "viewed") return "viewed";
  if (row.paperworkStatus === "sent" || row.signatureRequestId || row.paperworkSentAt) {
    return "confirmed_sent";
  }
  return null;
}

export async function runP1852SelectedHireRecovery(input?: {
  beforeEligible?: number;
  beforeQueueDepth?: number;
  forceDurableLocal?: boolean;
  /** Inject evidence index for tests */
  evidenceIndex?: Awaited<ReturnType<typeof loadP1852SelectionEvidenceIndex>>;
}): Promise<P1852RecoveryRunResult> {
  if (input?.forceDurableLocal !== false) {
    setP185StorageTestFlags({ forceDurable: true });
  }

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
  const allLookup = buildJobsLookupMap([...closedJobs, ...publishedJobs]);

  const candidates = listIngestedCandidates(store);
  const rows = candidates.map((c) =>
    buildScoredWorkflowRow(c, bundle.workflows[c.candidateId], {
      job: allLookup.get(c.positionId),
    }),
  );

  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((r) => [r.candidateId, r] as const),
  );

  const evidenceIndex = input?.evidenceIndex ?? (await loadP1852SelectionEvidenceIndex());
  const p1851State = await loadP1851RecoveryState();
  const p184Before = await loadP184EngineState();
  const beforeQueueDepth =
    input?.beforeQueueDepth ??
    p184Before.queue.filter((q) => q.status === "queued" || q.status === "failed_transient").length;
  const completedKeys = new Set(p184Before.completedIdempotencyKeys);

  const resolutions: P1852SelectionResolution[] = [];
  const templates: P1852TemplateReadiness[] = [];
  const normalizations: P1852NormalizationRecord[] = [];
  const operatorReview: P1852OperatorReviewRow[] = [];
  const verifiedOnboarding = new Map<string, P184VerifiedOnboardingJob>();
  const dryRunOverlays = new Map<string, ScoredCandidateWorkflowRow>();
  let duplicatesPrevented = 0;

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  for (const row of rows) {
    const evidence = evidenceIndex.byCandidate.get(row.candidateId) ?? [];
    const hasAuth = evidence.some((e) => e.authority === "authoritative");
    const mapping = resolveP1851JobMapping({
      row,
      publishedJobs,
      closedJobs,
      aliases: p1851State.aliases,
      selectedForHiring: hasAuth,
    });
    const template = resolveP1852TemplateReadiness(row);
    templates.push(template);

    const envelopeLifecycle = envelopeFromRow(row);
    const resolution = resolveP1852Selection({
      row,
      evidence,
      mapping,
      envelopeLifecycle,
      templateReady: template.templateReady,
      templateBlockingReason: template.blockingReason,
    });

    // Extra duplicate protection vs completed idempotency
    if (resolution.classification === "verified_selected_new_packet") {
      const templateKey = (template.templateKey ?? "onboarding_packet") as OnboardingTemplateKey;
      const idem = buildP184IdempotencyKey({
        candidateId: row.candidateId,
        templateKey,
        positionId: mapping.resolvedPositionId,
      });
      if (completedKeys.has(idem)) {
        duplicatesPrevented += 1;
        resolution.classification = "blocked_other";
        resolution.canAutoNormalize = false;
        resolution.blockingReasons = [`Completed idempotency key: ${idem}`];
        resolution.proposedPaperworkAction = "none";
        resolution.reviewBucket = "F";
      }
    }

    resolutions.push(resolution);

    const job = mapping.resolvedPositionId
      ? allLookup.get(mapping.resolvedPositionId)
      : undefined;

    if (["A", "B", "C", "D", "E", "I"].includes(resolution.reviewBucket)) {
      operatorReview.push({
        candidateId: row.candidateId,
        candidateName: displayName(row),
        candidateEmail: (row.email ?? row.onboardingContactEmail ?? "").trim(),
        originalStage: resolution.currentStage,
        normalizedStage:
          resolution.classification === "verified_selected_new_packet"
            ? "Paperwork Needed"
            : resolution.normalizedStage,
        selectionEvidence: resolution.authoritativeEvidence.map((e) => e.detail),
        evidenceSource: resolution.evidenceSource,
        evidenceDate: resolution.evidenceTimestamp,
        jobTitle: job?.name ?? row.positionName ?? null,
        jobLocation: job ? `${job.city}, ${job.state}` : null,
        resolvedJobId: mapping.resolvedPositionId,
        existingEnvelopeState: envelopeLifecycle,
        templateReadiness: template.templateReady,
        proposedAction: resolution.proposedPaperworkAction,
        blockingReason: resolution.blockingReasons[0] ?? null,
        bucket: resolution.reviewBucket,
      });
    }

    if (resolution.classification === "verified_selected_new_packet" && resolution.canAutoNormalize) {
      const templateKey = (template.templateKey ?? "onboarding_packet") as OnboardingTemplateKey;
      const resolvedPositionId = mapping.resolvedPositionId!;
      const idem = buildP184IdempotencyKey({
        candidateId: row.candidateId,
        templateKey,
        positionId: resolvedPositionId,
      });

      const overlay: ScoredCandidateWorkflowRow = {
        ...row,
        positionId: resolvedPositionId,
        workflowStatus: "Paperwork Needed",
        stage: "Paperwork Needed",
        paperworkTemplateKey: templateKey,
      };
      dryRunOverlays.set(row.candidateId, overlay);

      if (mapping.acceptingForOnboarding) {
        verifiedOnboarding.set(row.candidateId, {
          positionId: resolvedPositionId,
          acceptingForOnboarding: true,
          classification: mapping.onboardingJobClassification,
          detail: `P185.2 selected-hire onboarding job via ${mapping.mappingMethod}`,
        });
      }

      normalizations.push({
        candidateId: row.candidateId,
        originalStage: resolution.currentStage,
        normalizedStage: "Paperwork Needed",
        evidenceSummary: resolution.authoritativeEvidence.map((e) => `${e.source}: ${e.detail}`),
        normalizedAt: nowIso,
        actor: P185_2_OPERATOR,
        overlayOnly: true,
        resolvedPositionId,
        templateKey,
        idempotencyKey: idem,
      });
    } else if (
      resolution.classification === "verified_selected_existing_packet" ||
      resolution.classification === "verified_selected_completed_packet"
    ) {
      duplicatesPrevented += 1;
    }
  }

  // Clear any stale queued self-duplicates from a prior broken run so dry-run can evaluate cleanly.
  {
    const cleared = await loadP184EngineState();
    const keep = cleared.queue.filter(
      (q) => q.status === "sent" || q.status === "sending" || q.status === "failed_permanent",
    );
    cleared.queue = keep;
    await saveP184EngineState(cleared);
  }

  const allDryRunRows = rows.map((row) => {
    const overlay = dryRunOverlays.get(row.candidateId);
    if (overlay) return overlay;
    const res = resolutions.find((r) => r.candidateId === row.candidateId);
    if (res?.authoritativeEvidence.length && res.classification !== "applied_not_selected") {
      const mapped = resolveP1851JobMapping({
        row,
        publishedJobs,
        closedJobs,
        aliases: p1851State.aliases,
        selectedForHiring: true,
      });
      if (mapped.resolvedPositionId) {
        return { ...row, positionId: mapped.resolvedPositionId };
      }
    }
    return row;
  });

  // Dry-run evaluates overlays and writes eligible candidates into the durable P184 queue.
  const dryRun = await runP184AutonomousPaperworkSendEngine({
    candidates: allDryRunRows,
    onboardingByCandidateId,
    jobsByPositionId: allLookup,
    mode: "dry_run",
    maxSends: 0,
    byUserId: "p185-2-selected-hire-recovery",
    verifiedOnboardingJobByCandidateId: verifiedOnboarding,
  });

  const p184After = await loadP184EngineState();
  const queueDepth = p184After.queue.filter(
    (q) => q.status === "queued" || q.status === "failed_transient",
  ).length;

  const classCounts: Record<string, number> = {};
  for (const r of resolutions) {
    classCounts[r.classification] = (classCounts[r.classification] ?? 0) + 1;
  }

  const withAuth = resolutions.filter((r) => r.authoritativeEvidence.length > 0).length;
  const eligibleNew = classCounts.verified_selected_new_packet ?? 0;
  const projection = projectP1852ControlledRollout({ eligibleCount: eligibleNew });

  const storage = getP185StorageHealth();
  const p185 = await loadP185RunnerState();
  const liveBlockers = [
    "P184 remains enabled=false / mode=dry_run (intentional).",
    "P185_PRODUCTION_AUTOMATION_ENABLED is not set (intentional).",
  ];
  if (!isP185SchedulerAuthConfigured()) {
    liveBlockers.push("CRON_SECRET / P185_CRON_SECRET not configured.");
  }
  if (!readDropboxSignConfig()) liveBlockers.push("Dropbox Sign not configured.");
  if (!storage.durable) liveBlockers.push("Durable storage not healthy for live.");
  if (eligibleNew === 0) {
    liveBlockers.push("No verified_selected_new_packet candidates after recovery (all selected may already have packets).");
  }
  if (p185.safety.killSwitch) liveBlockers.push("Kill switch active.");

  const rejectionBuckets = buildP184RejectionBuckets(
    dryRun.report.rejected.map((r) => ({ candidateId: r.candidateId, reasons: r.reasons })),
  );

  const report: P1852RecoveryReport = {
    phase: P185_2_SOURCE_PHASE,
    generatedAt: nowIso,
    evidenceSourcesInspected: evidenceIndex.sourcesInspected.map((s) => ({
      source: s.source,
      authority: s.authority as P1852RecoveryReport["evidenceSourcesInspected"][0]["authority"],
      role: s.role,
    })),
    counts: {
      evaluated: rows.length,
      withAuthoritativeEvidence: withAuth,
      recoveredFromP181: [...evidenceIndex.p181Ids].filter((id) =>
        rows.some((r) => r.candidateId === id),
      ).length,
      recoveredFromP83Executed: [...evidenceIndex.p83ExecutedIds].filter((id) =>
        rows.some((r) => r.candidateId === id),
      ).length,
      recoveredFromP97: [...evidenceIndex.p97Ids].filter((id) =>
        rows.some((r) => r.candidateId === id),
      ).length,
      recoveredFromP158: [...evidenceIndex.p158Ids].filter((id) =>
        rows.some((r) => r.candidateId === id),
      ).length,
      normalizedToPaperworkNeeded: normalizations.length,
      eligibleNewPackets: eligibleNew,
      templateBlocked: classCounts.template_blocked ?? 0,
      unresolvedSelectedJobs: classCounts.unresolved_job ?? 0,
      needsOperatorConfirmation: classCounts.likely_selected_needs_review ?? 0,
      activePackets: classCounts.verified_selected_existing_packet ?? 0,
      completedPackets: classCounts.verified_selected_completed_packet ?? 0,
      queueDepth,
      duplicatesPrevented,
    },
    comparison: {
      beforeEligible: input?.beforeEligible ?? 0,
      afterEligible: dryRun.eligible,
      beforeQueueDepth,
      afterQueueDepth: queueDepth,
    },
    projection,
    dryRun: {
      evaluated: dryRun.evaluated,
      eligible: dryRun.eligible,
      rejected: dryRun.report.rejected.length,
      rejectionReasons: rejectionBuckets.map((b) => ({ reason: b.reason, count: b.count })),
    },
    classifications: classCounts,
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
      "Review secured operator cohorts A–E and I in .data/p185-2-selected-hire-operator-review-local.json",
      "Confirm template readiness for any bucket-B candidates",
      "Resolve jobs for bucket-C selected candidates",
      "Operator-confirm bucket-D likely-selected candidates if appropriate",
      "Set CRON_SECRET in deployment (never commit)",
      "Confirm durable storage + Dropbox Sign",
      "Re-run P185.2 dry-run; enable P184 dry_run then live only after gates green",
      "Set P185_PRODUCTION_AUTOMATION_ENABLED=1 last",
    ],
    warnings: [
      "Live sending remains disabled — no Dropbox Sign sends performed.",
      "Normalization uses overlay + P184 queue; source Breezy stages not overwritten.",
      "Applied candidates without authoritative evidence were not advanced.",
    ],
  };

  const state = await loadP1852State();
  state.lastRunAt = nowIso;
  state.normalizations = [...state.normalizations, ...normalizations].slice(-2_000);
  state.stats = report.counts;
  await saveP1852State(state);

  return {
    report,
    resolutions,
    operatorReview,
    normalizations,
    templates,
    evidenceSummary: {
      authoritativeCandidateIds: [
        ...new Set(
          resolutions
            .filter((r) => r.authoritativeEvidence.length > 0)
            .map((r) => r.candidateId),
        ),
      ],
      p181: [...evidenceIndex.p181Ids],
      p83Executed: [...evidenceIndex.p83ExecutedIds],
      p97: [...evidenceIndex.p97Ids],
      p158: [...evidenceIndex.p158Ids],
    },
  };
}
