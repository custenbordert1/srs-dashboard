import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { loadP97State } from "@/lib/approval-mode-production/approval-mode-store";
import {
  appendP100Audit,
  loadP100State,
  newP100ExecutionId,
  saveP100State,
} from "@/lib/controlled-live-send/controlled-live-send-store";
import {
  assertExecutionLocksPass,
  buildReportPaths,
  loadExecutionLockContext,
  resolveGoNoGo,
  validateExecutionLocks,
} from "@/lib/controlled-live-send/validate-execution-locks";
import type {
  ControlledLiveSendCandidateEntry,
  ControlledLiveSendExecutionEntry,
  ControlledLiveSendMetrics,
  ControlledLiveSendReport,
  ControlledLiveSendResult,
  ControlledLiveSendMode,
} from "@/lib/controlled-live-send/types";
import { P100_EXPECTED_CANDIDATE_COUNT, P100_SOURCE_PHASE } from "@/lib/controlled-live-send/types";
import { prepareOnboardingSend } from "@/lib/autonomous-paperwork-send-engine/prepare-onboarding-send";
import {
  executeOnboardingSend,
  type ExecuteOnboardingSendDeps,
} from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { transitionOnboardingRecordStatus } from "@/lib/candidate-onboarding-send-queue/send-queue-onboarding-updates";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function snapshotExecutionState(record: CandidateWorkflowRecord | undefined): ControlledLiveSendExecutionEntry["beforeState"] {
  return {
    workflowStatus: record?.workflowStatus ?? "Applied",
    actionType: record?.actionType ?? null,
    paperworkStatus: record?.paperworkStatus ?? "not_sent",
    signatureRequestId: record?.signatureRequestId ?? null,
  };
}

function isAlreadySent(row: ScoredCandidateWorkflowRow): boolean {
  return (
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Signed" ||
    row.workflowStatus === "Paperwork Sent" ||
    Boolean(row.signatureRequestId?.trim())
  );
}

function buildCandidateEntries(input: {
  rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
  p97PersistedIds: string[];
  p97Names: Map<string, string>;
  onboardingByCandidateId: Map<string, import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord>;
  jobsByPositionId: Map<string, import("@/lib/breezy-api").BreezyJob>;
  p100State: Awaited<ReturnType<typeof loadP100State>>;
}): ControlledLiveSendCandidateEntry[] {
  return input.p97PersistedIds.map((candidateId) => {
    const row = input.rowsByCandidateId.get(candidateId);
    const name = input.p97Names.get(candidateId) ?? candidateId;
    if (!row) {
      return {
        candidateId,
        candidateName: name,
        email: "",
        status: "blocked",
        p84Eligible: false,
        blockingReasons: ["Candidate row not found."],
        signatureRequestId: null,
        lastExecutionAt: null,
      };
    }

    const p84 = buildPaperworkSendEligibility({
      row,
      onboarding: input.onboardingByCandidateId.get(candidateId) ?? null,
      jobsByPositionId: input.jobsByPositionId,
    });

    let status: ControlledLiveSendCandidateEntry["status"] = "blocked";
    if (isAlreadySent(row) || input.p100State.sentCandidateIds.includes(candidateId)) {
      status = "sent";
    } else if (input.p100State.failedCandidateIds.includes(candidateId)) {
      status = "failed";
    } else if (!p84.eligible) {
      status = "blocked";
    } else {
      status = "ready";
    }

    return {
      candidateId,
      candidateName: name,
      email: row.email?.trim() || "",
      status,
      p84Eligible: p84.eligible,
      blockingReasons: p84.blockingReasons,
      signatureRequestId: row.signatureRequestId,
      lastExecutionAt: input.p100State.lastExecutionAt,
    };
  });
}

function buildMetrics(candidates: ControlledLiveSendCandidateEntry[]): ControlledLiveSendMetrics {
  const sent = candidates.filter((c) => c.status === "sent").length;
  const failed = candidates.filter((c) => c.status === "failed").length;
  const skipped = candidates.filter((c) => c.status === "skipped").length;
  const readyToSend = candidates.filter((c) => c.status === "ready").length;
  const blocked = candidates.filter((c) => c.status === "blocked").length;
  const remaining = readyToSend;
  return {
    totalCandidates: candidates.length,
    readyToSend,
    sent,
    skipped,
    failed: failed + blocked,
    remaining,
  };
}

async function loadCandidateContext(input?: { mtdOnly?: boolean }): Promise<{
  rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
  jobsByPositionId: Map<string, import("@/lib/breezy-api").BreezyJob>;
  onboardingByCandidateId: Map<string, import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord>;
  p97PersistedIds: string[];
  p97Names: Map<string, string>;
  mtdRangeLabel: string;
}> {
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

  const [p97State, store, bundle, jobsResult, onboardingRecords] = await Promise.all([
    loadP97State(),
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );

  const range = currentMtdDateRange();
  const candidates =
    input?.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);

  const rowsByCandidateId = new Map(
    candidates.map((candidate) => [
      candidate.candidateId,
      buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    ]),
  );

  for (const persisted of p97State.persisted) {
    const row = rowsByCandidateId.get(persisted.candidateId);
    if (!row?.positionId || jobsByPositionId.has(row.positionId)) continue;
    jobsByPositionId.set(row.positionId, {
      jobId: row.positionId,
      name: row.positionName ?? "",
      city: row.city,
      state: row.state,
      zip: row.zipCode ?? "",
      displayLocation: `${row.city}, ${row.state}`.replace(/^, |, $/g, ""),
      locationSource: "missing",
      status: "published",
      createdDate: "",
      updatedDate: "",
    });
  }

  return {
    rowsByCandidateId,
    jobsByPositionId,
    onboardingByCandidateId: new Map(onboardingRecords.map((r) => [r.candidateId, r])),
    p97PersistedIds: p97State.persisted.map((p) => p.candidateId),
    p97Names: new Map(p97State.persisted.map((p) => [p.candidateId, p.candidateName])),
    mtdRangeLabel: `${range.start}..${range.end}`,
  };
}

export async function buildControlledLiveSendReport(input?: {
  mtdOnly?: boolean;
  mode?: ControlledLiveSendMode;
  executiveApprovalFlag?: boolean;
  confirmationPhrase?: string;
  candidateCount?: number;
}): Promise<ControlledLiveSendReport> {
  const generatedAt = new Date().toISOString();
  const mode = input?.mode ?? "dryRun";
  const [context, p100State, lockContext] = await Promise.all([
    loadCandidateContext(input),
    loadP100State(),
    loadExecutionLockContext(),
  ]);

  const candidates = buildCandidateEntries({
    ...context,
    p100State,
  });
  const metrics = buildMetrics(candidates);
  const blockedCount = candidates.filter((c) => c.status === "blocked").length;

  const safetyLocks = validateExecutionLocks({
    mode,
    executiveApprovalFlag: input?.executiveApprovalFlag,
    confirmationPhrase: input?.confirmationPhrase,
    candidateCount: input?.candidateCount,
    readinessApproved: lockContext.readinessApproved,
    rollbackEntryCount: lockContext.rollbackEntryCount,
    auditEntryCount: lockContext.auditEntryCount,
    blockedCount,
    readyCount: metrics.readyToSend + metrics.sent,
    p84Flags: lockContext.p84Flags,
  });

  const { goNoGo, goNoGoReason } = resolveGoNoGo(safetyLocks);
  const paths = buildReportPaths();

  return {
    sourcePhase: P100_SOURCE_PHASE,
    generatedAt,
    defaultMode: "dryRun",
    sectionTitle: "Controlled Live Send",
    cohortLabel: `P97 persisted cohort — controlled P100 live send (${P100_EXPECTED_CANDIDATE_COUNT} candidates)`,
    metrics,
    candidates,
    safetyLocks,
    liveSend: lockContext.p84Flags.liveSend,
    p84Enabled: lockContext.p84Flags.enabled,
    p84LiveMode: lockContext.p84Flags.liveMode,
    readinessApproved: lockContext.readinessApproved,
    requiredBatchConfirmationPhrase: "SEND 27 PAPERWORK PACKETS",
    expectedCandidateCount: P100_EXPECTED_CANDIDATE_COUNT,
    goNoGo,
    goNoGoReason,
    ...paths,
  };
}

export async function executeControlledLiveSend(input: {
  mode?: ControlledLiveSendMode;
  executiveApprovalFlag?: boolean;
  confirmationPhrase?: string;
  candidateCount?: number;
  candidateId?: string;
  byUserId?: string;
  mtdOnly?: boolean;
  sendDeps?: ExecuteOnboardingSendDeps;
}): Promise<ControlledLiveSendResult> {
  const mode = input.mode ?? "dryRun";
  const report = await buildControlledLiveSendReport({
    mtdOnly: input.mtdOnly,
    mode,
    executiveApprovalFlag: input.executiveApprovalFlag,
    confirmationPhrase: input.confirmationPhrase,
    candidateCount: input.candidateCount,
  });

  assertExecutionLocksPass(report.safetyLocks, mode);

  const context = await loadCandidateContext({ mtdOnly: input.mtdOnly });
  const p100State = await loadP100State();
  const executed: ControlledLiveSendExecutionEntry[] = [];
  const warnings: string[] = [
    mode === "dryRun"
      ? "dryRun — no Dropbox Sign calls."
      : `Live mode ${mode} — sends only when all per-candidate gates pass.`,
    "No Breezy writes in P100.",
  ];

  const bundle = await (await import("@/lib/candidate-workflow-store")).getCandidateWorkflowBundle();
  const targetIds =
    mode === "executeOne" && input.candidateId
      ? [input.candidateId]
      : context.p97PersistedIds;

  let stoppedEarly = false;
  let stopReason: string | null = null;
  let liveSendsThisRun = 0;
  const maxSends = mode === "executeOne" ? 1 : mode === "executeBatch" ? P100_EXPECTED_CANDIDATE_COUNT : 0;

  for (const candidateId of targetIds) {
    if (mode !== "dryRun" && liveSendsThisRun >= maxSends) break;

    const row = context.rowsByCandidateId.get(candidateId);
    const name = context.p97Names.get(candidateId) ?? candidateId;
    const workflow = bundle.workflows[candidateId];
    const beforeState = snapshotExecutionState(workflow);

    if (!row) {
      const entry: ControlledLiveSendExecutionEntry = {
        id: newP100ExecutionId(),
        at: new Date().toISOString(),
        phase: P100_SOURCE_PHASE,
        mode,
        candidateId,
        candidateName: name,
        outcome: "skipped",
        beforeState,
        error: "Candidate row not found.",
        simulated: mode === "dryRun",
      };
      executed.push(entry);
      await appendP100Audit(entry);
      continue;
    }

    if (isAlreadySent(row) || p100State.sentCandidateIds.includes(candidateId)) {
      const entry: ControlledLiveSendExecutionEntry = {
        id: newP100ExecutionId(),
        at: new Date().toISOString(),
        phase: P100_SOURCE_PHASE,
        mode,
        candidateId,
        candidateName: name,
        outcome: "skipped",
        beforeState,
        error: "Already sent — idempotent skip.",
        simulated: mode === "dryRun",
      };
      executed.push(entry);
      if (!p100State.skippedCandidateIds.includes(candidateId)) {
        p100State.skippedCandidateIds.push(candidateId);
      }
      await appendP100Audit(entry);
      continue;
    }

    const p84 = buildPaperworkSendEligibility({
      row,
      onboarding: context.onboardingByCandidateId.get(candidateId) ?? null,
      jobsByPositionId: context.jobsByPositionId,
    });

    if (!p84.eligible || !p84.templateKey) {
      const entry: ControlledLiveSendExecutionEntry = {
        id: newP100ExecutionId(),
        at: new Date().toISOString(),
        phase: P100_SOURCE_PHASE,
        mode,
        candidateId,
        candidateName: name,
        outcome: "skipped",
        beforeState,
        error: p84.blockingReasons[0] ?? "P84 not eligible at execution time.",
        simulated: mode === "dryRun",
      };
      executed.push(entry);
      await appendP100Audit(entry);
      continue;
    }

    if (mode === "dryRun") {
      const entry: ControlledLiveSendExecutionEntry = {
        id: newP100ExecutionId(),
        at: new Date().toISOString(),
        phase: P100_SOURCE_PHASE,
        mode,
        candidateId,
        candidateName: name,
        outcome: "simulated",
        beforeState,
        simulated: true,
      };
      executed.push(entry);
      await appendP100Audit(entry);
      continue;
    }

    const prepared = await prepareOnboardingSend({
      candidateId,
      templateKey: p84.templateKey,
      actionType: row.actionType ?? undefined,
    });

    const sendingAt = new Date().toISOString();
    await transitionOnboardingRecordStatus({
      onboardingId: prepared.onboardingId,
      status: "sending",
      detail: "P100 controlled live send started",
      now: sendingAt,
      patch: { lastSendAttemptAt: sendingAt },
    });

    const candidateName = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email || name;
    const sendResult = await executeOnboardingSend(
      {
        candidateId,
        candidateName,
        candidateEmail: row.email ?? "",
        templateKey: p84.templateKey,
        byUserId: input.byUserId,
        recordWorkflowFailureOnError: false,
        inFlightOnboardingId: prepared.onboardingId,
      },
      input.sendDeps,
    );

    if (sendResult.ok) {
      liveSendsThisRun += 1;
      await upsertCandidateWorkflow({
        candidateId,
        actionType: "await-signature",
        requiredAction: "Paperwork sent — awaiting signature.",
        actionReason: "P100 controlled live send completed.",
        audit: { action: "p100_controlled_live_send", byUserId: input.byUserId },
      });

      const afterWorkflow = sendResult.workflow;
      const entry: ControlledLiveSendExecutionEntry = {
        id: newP100ExecutionId(),
        at: new Date().toISOString(),
        phase: P100_SOURCE_PHASE,
        mode,
        candidateId,
        candidateName: name,
        outcome: "sent",
        beforeState,
        afterState: snapshotExecutionState(afterWorkflow),
        signatureRequestId: sendResult.signatureRequestId,
        simulated: false,
      };
      executed.push(entry);
      if (!p100State.sentCandidateIds.includes(candidateId)) {
        p100State.sentCandidateIds.push(candidateId);
      }
      await appendP100Audit(entry);

      if (mode === "executeOne") break;
      continue;
    }

    const entry: ControlledLiveSendExecutionEntry = {
      id: newP100ExecutionId(),
      at: new Date().toISOString(),
      phase: P100_SOURCE_PHASE,
      mode,
      candidateId,
      candidateName: name,
      outcome: "failed",
      beforeState,
      error: sendResult.error,
      simulated: false,
    };
    executed.push(entry);
    if (!p100State.failedCandidateIds.includes(candidateId)) {
      p100State.failedCandidateIds.push(candidateId);
    }
    await appendP100Audit(entry);

    if (!sendResult.transient) {
      stoppedEarly = true;
      stopReason = `Critical error for ${candidateId}: ${sendResult.error}`;
      break;
    }
  }

  p100State.lastExecutionAt = new Date().toISOString();
  p100State.lastMode = mode;
  p100State.updatedAt = p100State.lastExecutionAt;
  await saveP100State(p100State);

  const refreshedReport = await buildControlledLiveSendReport({ mtdOnly: input.mtdOnly, mode });

  return {
    ok: true,
    mode,
    stoppedEarly,
    stopReason,
    executed,
    report: refreshedReport,
    warnings,
  };
}
