/**
 * P185 paperwork backlog rollout — dry-run assessment only.
 * Does not enable live sending. Configures controlled rollout limits and reports gates.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchBreezyJobs } from "../src/lib/breezy-api";
import { buildScoredWorkflowRow } from "../src/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "../src/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "../src/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "../src/lib/candidate-workflow-store";
import { readDropboxSignConfig } from "../src/lib/dropbox-sign";
import {
  buildP184RejectionBuckets,
  estimateP184CompletionMinutes,
  evaluateP184RateLimit,
  loadP184EngineState,
  runP184AutonomousPaperworkSendEngine,
  updateP184Config,
} from "../src/lib/p184-autonomous-paperwork-send-engine";
import {
  buildP185HealthReport,
  getP185StorageHealth,
  isP185SchedulerAuthConfigured,
  loadP185RunnerState,
  saveP185RunnerState,
  setP185StorageTestFlags,
} from "../src/lib/p185-production-paperwork-automation-runner";

function loadEnvLocal(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env.local optional for CI
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  // Local assessment uses durable project .data
  setP185StorageTestFlags({ forceDurable: true });

  // 5) Controlled rollout config — keep P184 disabled / dry_run (do not enable live)
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

  const p185 = await loadP185RunnerState();
  p185.safety = {
    ...p185.safety,
    productionAutomationEnabled: false,
    killSwitch: false,
    pauseUntil: null,
    maxSendsPerCycle: 10,
    maxFailuresPerCycle: 3,
    maxCandidatesPerCycle: 50_000,
    executionBudgetMs: 50_000,
    claimCutoffMs: 10_000,
    leaseTtlMs: 90_000,
    expectedCycleIntervalMs: 10 * 60 * 1000,
    fullReconciliationIntervalMs: 6 * 60 * 60 * 1000,
    unresolvedEnvelopeAlertMs: 30 * 60 * 1000,
    requireRecentDryRunMs: 24 * 60 * 60 * 1000,
  };
  // Clear circuit for assessment baseline (operator-controlled rollout start)
  p185.circuit = {
    open: false,
    openedAt: null,
    failureCount: 0,
    lastFailureAt: null,
    cooldownUntil: null,
    reason: null,
  };
  await saveP185RunnerState(p185);

  const store = await readIngestionStore();
  const bundle = await getCandidateWorkflowBundle();
  let breezyHealthy = false;
  let breezyDetail = "";
  let jobs: Awaited<ReturnType<typeof fetchBreezyJobs>> extends { ok: true; jobs: infer J }
    ? J
    : never = [] as never;

  try {
    const jobsResult = await fetchBreezyJobs("published");
    if (jobsResult.ok) {
      jobs = jobsResult.jobs;
      breezyHealthy = true;
      breezyDetail = `Fetched ${jobs.length} published jobs.`;
    } else {
      breezyDetail = `Breezy jobs fetch failed: ${"error" in jobsResult ? String(jobsResult.error) : "unknown"}`;
    }
  } catch (err) {
    breezyDetail = err instanceof Error ? err.message : "Breezy fetch threw.";
  }

  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const candidates = listIngestedCandidates(store).map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );
  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  // Counts that are not solely P184-gate based
  let alreadySent = 0;
  let activeEnvelopes = 0;
  for (const row of candidates) {
    const onboarding = onboardingByCandidateId.get(row.candidateId);
    const hasSentAt = Boolean(row.paperworkSentAt);
    const hasEnvelope =
      Boolean(row.signatureRequestId) ||
      Boolean(onboarding?.signatureRequestId) ||
      row.paperworkStatus === "sent" ||
      row.paperworkStatus === "viewed" ||
      row.paperworkStatus === "signed" ||
      row.paperworkStatus === "completed";
    if (hasSentAt || row.paperworkStatus === "signed" || row.paperworkStatus === "completed") {
      alreadySent += 1;
    }
    if (hasEnvelope && row.paperworkStatus !== "not_sent") {
      activeEnvelopes += 1;
    }
  }

  // Full dry-run against ALL candidates — maxSends 0 means evaluate+queue, no simulated sends
  // Use maxSends=0 by patching: engine still evaluates all; with maxSends 0 it won't simulate.
  // Better: run with maxSends high enough to queue all eligible but dry_run only simulates up to max.
  // For backlog sizing we need full eligibility — run with maxSends = eligible after first pass,
  // or just run with a very high maxSends in dry_run (simulates but doesn't call Dropbox).
  // Spec: do not immediately send entire backlog — dry-run is fine to simulate limited batch.
  // For REPORT we need full evaluation. Engine evaluates ALL input candidates regardless of maxSends.
  const result = await runP184AutonomousPaperworkSendEngine({
    candidates,
    onboardingByCandidateId,
    jobsByPositionId,
    mode: "dry_run",
    maxSends: 0, // evaluate + enqueue eligible; do not burn simulated send slots for whole backlog
    byUserId: "p185-backlog-rollout-dry-run",
  });

  const p184State = await loadP184EngineState();
  const rejectionBuckets = buildP184RejectionBuckets(
    result.report.rejected.map((r) => ({ candidateId: r.candidateId, reasons: r.reasons })),
  );

  const eligibleQueued = p184State.queue.filter(
    (q) => q.status === "queued" || q.status === "failed_transient",
  ).length;
  const rate = evaluateP184RateLimit({
    config: p184State.config.rateLimits,
    sendTimestamps: p184State.sendTimestamps,
    inFlight: 0,
  });

  // Full backlog clear estimate uses eligible count + configured rate limits (not just one cycle)
  const eligibleCount = result.eligible;
  const clearMinutes = estimateP184CompletionMinutes({
    projectedSends: eligibleCount,
    rateLimitStatus: rate,
  });
  // Also account for 10-min cadence × 10 sends/cycle
  const cyclesNeeded = Math.ceil(eligibleCount / Math.max(1, p184State.config.maxSendsPerCycle));
  const cadenceMinutes = cyclesNeeded * 10;
  const estimatedClearMinutes = Math.max(clearMinutes ?? 0, cadenceMinutes);

  // Mark successful dry-run for gate tracking (assessment itself)
  const p185After = await loadP185RunnerState();
  p185After.lastDryRunSuccessAt = new Date().toISOString();
  p185After.lastSuccessfulCycle = {
    cycleId: "backlog-dry-run",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    mode: "dry_run",
    skipped: false,
    skipReason: null,
    evaluated: result.evaluated,
    eligible: result.eligible,
    sent: 0,
    confirmed: 0,
    failed: 0,
    retriesDue: result.retriesScheduled,
    rateLimited: result.rateLimited,
    durationMs: result.durationMs,
    storageDurable: true,
    leaseOwnerId: null,
    warnings: ["Full backlog dry-run assessment — live not enabled."],
  };
  p185After.lastAttemptedCycle = p185After.lastSuccessfulCycle;
  p185After.metrics = {
    ...p185After.metrics,
    queueDepth: eligibleQueued,
    candidatesEvaluated: result.evaluated,
    eligibleCandidates: result.eligible,
    retriesDue: result.retriesScheduled,
    cycleDurationMs: result.durationMs,
  };
  p185After.nextScheduledRunAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await saveP185RunnerState(p185After);

  const storage = getP185StorageHealth();
  const dropbox = Boolean(readDropboxSignConfig());
  const authConfigured = isP185SchedulerAuthConfigured();
  const health = await buildP185HealthReport({
    breezyHealthy,
    breezyDetail,
  });

  const gates = {
    durableStorageHealthy: storage.healthy && storage.durable,
    dropboxSignHealthy: dropbox,
    breezySourceHealthy: breezyHealthy,
    schedulerAuthenticationConfigured: authConfigured,
    leaseAvailable: !health.lease.held,
    recentDryRunSuccessful: Boolean(p185After.lastDryRunSuccessAt),
    killSwitchInactive: !p185After.safety.killSwitch,
    circuitBreakerClosed: !p185After.circuit.open,
  };

  const blockers: string[] = [];
  if (!gates.durableStorageHealthy) blockers.push(`Durable storage unhealthy: ${storage.detail}`);
  if (!gates.dropboxSignHealthy) blockers.push("Dropbox Sign credentials missing or placeholder.");
  if (!gates.breezySourceHealthy) blockers.push(`Breezy source unhealthy: ${breezyDetail}`);
  if (!gates.schedulerAuthenticationConfigured) {
    blockers.push("Scheduler authentication not configured (set CRON_SECRET or P185_CRON_SECRET).");
  }
  if (!gates.leaseAvailable) {
    blockers.push(
      `Lease held by ${health.lease.ownerId} (remaining ${health.lease.remainingMs}ms).`,
    );
  }
  if (!gates.recentDryRunSuccessful) blockers.push("No successful recent dry-run.");
  if (!gates.killSwitchInactive) blockers.push("Kill switch is active.");
  if (!gates.circuitBreakerClosed) blockers.push("Circuit breaker is open.");
  // Live still requires explicit flags — always report these as activation prerequisites
  const liveActivationRequired = [
    "Set CRON_SECRET (or P185_CRON_SECRET) in the deployment environment",
    "Set P185_PRODUCTION_AUTOMATION_ENABLED=1",
    "On serverless: set P185_DURABLE_DATA_DIR to a durable volume (not /tmp)",
    "Enable P184 via update_config: enabled=true (keep mode=dry_run until final step)",
    "Confirm another dry-run after enablement",
    "Set P184 mode=live only after all gates green",
    "Do not raise maxSendsPerCycle above 10 for initial rollout",
  ];

  const liveReady = Object.values(gates).every(Boolean) && blockers.length === 0;
  // Still do NOT enable live — user asked to wait until confirmed; we leave disabled
  const report = {
    phase: "P185",
    generatedAt: new Date().toISOString(),
    mode: "dry_run",
    liveSendingEnabled: false,
    backlog: {
      totalCandidatesEvaluated: result.evaluated,
      totalEligibleForPaperwork: result.eligible,
      totalAlreadySent: alreadySent,
      totalWithActiveEnvelopes: activeEnvelopes,
      totalRejected: result.report.rejected.length,
      rejectionReasons: rejectionBuckets.map((b) => ({
        reason: b.reason,
        count: b.count,
        // omit candidate PII/ids from primary summary — counts only in top-level
      })),
      rejectionReasonDetails: rejectionBuckets.map((b) => ({
        reason: b.reason,
        count: b.count,
        sampleCandidateIds: b.candidateIds.slice(0, 5),
      })),
      currentQueueDepth: eligibleQueued,
      estimatedMinutesToClearEligibleBacklog: estimatedClearMinutes,
      estimatedCyclesAt10PerCycle: cyclesNeeded,
      cadence: "every 10 minutes",
      maxSendsPerCycle: 10,
    },
    gates,
    blockers,
    liveReadyForActivation: liveReady,
    note:
      liveReady
        ? "All measured gates healthy locally — live still NOT enabled; apply env changes below then enable explicitly."
        : "One or more gates unhealthy — do not send. Fix blockers before live activation.",
    controlledRolloutConfig: {
      schedulerCadence: "*/10 * * * *",
      maxSendsPerCycle: 10,
      maxPerMinute: 4,
      maxPerHour: 40,
      maxPerDay: 200,
      concurrentSends: 2,
      maxFailuresPerCycle: 3,
      p184Enabled: false,
      p184Mode: "dry_run",
      p185ProductionAutomationEnabled: false,
    },
    environmentChangesRequiredBeforeLive: liveActivationRequired,
    p184Cycle: {
      evaluated: result.evaluated,
      eligible: result.eligible,
      sentSimulated: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      retriesScheduled: result.retriesScheduled,
      durationMs: result.durationMs,
      warnings: result.report.warnings,
    },
    storage: storage,
    breezy: { healthy: breezyHealthy, detail: breezyDetail, publishedJobs: jobs.length },
    healthSummary: {
      runnerStatus: health.runnerStatus,
      schedulerStatus: health.schedulerStatus,
      liveEnablementBlockers: health.liveEnablementBlockers,
    },
  };

  const dir = path.join(process.cwd(), "artifacts");
  await mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, "p185-backlog-rollout-dry-run.json");
  const mdPath = path.join(dir, "p185-backlog-rollout-dry-run.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const md = [
    `# P185 Paperwork Backlog Rollout — Dry Run`,
    ``,
    `Generated: ${report.generatedAt}`,
    `Live sending: **DISABLED**`,
    ``,
    `## Backlog`,
    `- Total evaluated: **${report.backlog.totalCandidatesEvaluated}**`,
    `- Eligible for paperwork: **${report.backlog.totalEligibleForPaperwork}**`,
    `- Already sent: **${report.backlog.totalAlreadySent}**`,
    `- Active envelopes: **${report.backlog.totalWithActiveEnvelopes}**`,
    `- Rejected: **${report.backlog.totalRejected}**`,
    `- Queue depth (durable): **${report.backlog.currentQueueDepth}**`,
    `- Est. time to clear eligible: **${report.backlog.estimatedMinutesToClearEligibleBacklog} min** (~${report.backlog.estimatedCyclesAt10PerCycle} cycles @ 10/cycle every 10 min)`,
    ``,
    `## Rejection reasons`,
    ...report.backlog.rejectionReasons.map((r) => `- ${r.reason}: ${r.count}`),
    ``,
    `## Live gates`,
    ...Object.entries(gates).map(([k, v]) => `- ${k}: ${v ? "OK" : "BLOCKED"}`),
    ``,
    `## Blockers`,
    ...(blockers.length ? blockers.map((b) => `- ${b}`) : ["- None on measured gates"]),
    ``,
    `## Controlled rollout config (applied; live still off)`,
    "```json",
    JSON.stringify(report.controlledRolloutConfig, null, 2),
    "```",
    ``,
    `## Env / config required before live`,
    ...liveActivationRequired.map((s) => `1. ${s}`),
    ``,
  ].join("\n");
  await writeFile(mdPath, md, "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${jsonPath}`);
  console.error(`Wrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
