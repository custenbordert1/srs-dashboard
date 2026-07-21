import { createHash, randomUUID } from "node:crypto";
import { runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle";
import { orchestrate } from "@/lib/candidate-evaluation-orchestrator/orchestrate";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  refreshBreezyCandidateData,
  resetToFreshNewState,
  validateP240FreshNewReset,
} from "@/lib/p240-autonomous-new-applicant-pipeline/freshness";
import {
  buildP243Fingerprint,
  hasAlreadySentPaperwork,
  loadP243IdempotencyStore,
  normalizeEmailFingerprint,
  p243IdempotencyStorePath,
  recordIdempotent,
  saveP243IdempotencyStore,
  shouldSkipIdempotent,
  touchLastChecked,
} from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import { runP243Preflight } from "@/lib/p243-autonomous-end-to-end-pipeline/preflight";
import { pullPendingCandidates } from "@/lib/p243-autonomous-end-to-end-pipeline/pull";
import {
  evaluateP243StateMachine,
  isNeverSendTwiceBlocked,
} from "@/lib/p243-autonomous-end-to-end-pipeline/state-machine";
import type {
  AutonomousCandidateResult,
  AutonomousCycleOptions,
  AutonomousCycleReport,
  P243ExecutionMode,
  P243FailureReasonCount,
} from "@/lib/p243-autonomous-end-to-end-pipeline/types";
import { P243_SCHEMA_VERSION, P243_SOURCE_PHASE } from "@/lib/p243-autonomous-end-to-end-pipeline/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

const DEFAULT_CANARY_LIMIT = 3;
const HIGH_REVIEW_QUEUE_PCT = 50;
const LOW_ADVANCE_RATE_PCT = 10;

function redact(id: string): string {
  return createHash("sha256").update(`p243:${id}`).digest("hex").slice(0, 12);
}

function displayName(row: { firstName?: string; lastName?: string; name?: string }): string {
  const joined = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return joined || row.name || "Unknown";
}

function resolveExecutionMode(input: {
  dryRun: boolean;
  liveExecute: boolean;
  fullLive: boolean;
}): P243ExecutionMode {
  if (!input.liveExecute || input.dryRun) return "dry_run";
  return input.fullLive ? "full_live" : "canary_live";
}

function tallyFailureReasons(
  failuresDetail: Array<{ candidateId: string; error: string }>,
  skipReasons: string[],
): P243FailureReasonCount[] {
  const counts = new Map<string, number>();
  for (const f of failuresDetail) {
    const key = f.error.slice(0, 120) || "unknown_error";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const reason of skipReasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function buildWarnings(input: {
  scored: number;
  autoAdvance: number;
  humanReview: number;
  failures: number;
  executionMode: P243ExecutionMode;
  preflightOk: boolean;
}): string[] {
  const warnings: string[] = [];
  if (!input.preflightOk && input.executionMode !== "dry_run") {
    warnings.push("Preflight failed — live execute blocked; cycle continued in plan-only mode.");
  }
  if (input.scored > 0) {
    const reviewPct = Math.round((input.humanReview / input.scored) * 100);
    const advancePct = Math.round((input.autoAdvance / input.scored) * 100);
    if (reviewPct >= HIGH_REVIEW_QUEUE_PCT) {
      warnings.push(
        `High review queue: ${reviewPct}% human_review (${input.humanReview}/${input.scored}).`,
      );
    }
    if (advancePct < LOW_ADVANCE_RATE_PCT && input.scored >= 5) {
      warnings.push(
        `Low advance rate: ${advancePct}% auto_advance (${input.autoAdvance}/${input.scored}).`,
      );
    }
  }
  if (input.failures > 0) {
    warnings.push(`${input.failures} candidate(s) failed during cycle processing.`);
  }
  return warnings;
}

function emptyCandidateResult(input: {
  row: {
    candidateId: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    positionId?: string | null;
    appliedDate?: string | null;
    creationDate?: string | null;
    createdDate?: string | null;
  };
  outcome: AutonomousCandidateResult["outcome"];
  skipReason: string | null;
  ceoTraceId: string | null;
  p204Recommendation?: string | null;
  confidence?: number | null;
  error?: string | null;
}): AutonomousCandidateResult {
  return {
    candidateId: input.row.candidateId,
    redactedCandidateId: redact(input.row.candidateId),
    name: displayName(input.row),
    positionId: input.row.positionId ?? null,
    appliedAt: input.row.appliedDate ?? input.row.creationDate ?? input.row.createdDate ?? null,
    outcome: input.outcome,
    p204Recommendation: input.p204Recommendation ?? null,
    confidence: input.confidence ?? null,
    paperworkTasksPlanned: 0,
    paperworkExecuted: false,
    breezyStageUpdatePlanned: false,
    breezyStageUpdated: false,
    skipReason: input.skipReason,
    error: input.error ?? null,
    ceoTraceId: input.ceoTraceId,
  };
}

/**
 * Main autonomous entry point: pull → score (P204/CEO) → decide → plan/send paperwork.
 * Default dryRun=true: zero Breezy / Dropbox / workflow / idempotency durable writes.
 * Live requires confirmLive; canary caps sends unless fullLive=true.
 * Dropbox testMode=true is enforced via preflight until separately authorized.
 */
export async function runAutonomousRecruitingCycle(
  options: AutonomousCycleOptions = {},
): Promise<AutonomousCycleReport> {
  const dryRunRequested = options.dryRun !== false;
  const useLLMEnhancement = Boolean(options.useLLMEnhancement);
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
  const batchId = options.batchId ?? randomUUID();
  const respectIdempotency = options.respectIdempotency !== false;
  const fullLive = options.fullLive === true;
  const canaryLimit = Math.max(1, Math.min(options.canaryLimit ?? DEFAULT_CANARY_LIMIT, 25));
  const confirmLive = options.confirmLive === true;
  const started = Date.now();
  const notes: string[] = [];
  const skipReasonSamples: string[] = [];

  const preflight = runP243Preflight({
    dryRun: dryRunRequested,
    confirmLive,
    fullLive,
    canaryLimit,
  });

  let dryRun = dryRunRequested;
  let liveExecute = !dryRun && confirmLive && preflight.ok;

  if (!dryRunRequested && !confirmLive) {
    notes.push("Live blocked: set confirmLive=true to allow paperwork execute. Falling back to dry-run planning.");
    dryRun = true;
    liveExecute = false;
  } else if (!dryRunRequested && confirmLive && !preflight.ok) {
    notes.push(
      `Live blocked by preflight: ${preflight.executionBlockedReason ?? "checks failed"}. Falling back to dry-run planning.`,
    );
    dryRun = true;
    liveExecute = false;
  }

  const executionMode = resolveExecutionMode({ dryRun, liveExecute, fullLive });
  notes.push(
    dryRun
      ? "DRY RUN — no Breezy stage writes, no Dropbox sends, no idempotency persistence."
      : executionMode === "full_live"
        ? "FULL LIVE — canary cap disabled; Dropbox execute still gated by P123 + testMode."
        : `CANARY LIVE — at most ${canaryLimit} auto_advance paperwork send(s) this cycle.`,
  );

  let idempotency = await loadP243IdempotencyStore();

  const pulled = await pullPendingCandidates({
    limit,
    positionIds: options.positionIds,
    preferWebhooks: options.preferWebhooks,
    enableSmartPoll: options.enableSmartPoll,
    lastCheckedAt: idempotency.lastCheckedAt,
  });
  notes.push(...pulled.notes);

  let rowsForCeo = pulled.rows;
  let breezyForCeo: BreezyCandidate[] = [...pulled.breezyLiveCandidates];
  // forceFreshReset is canonical; forceFreshData remains a backward-compat alias.
  const forceFreshReset =
    options.forceFreshReset === true || options.forceFreshData === true;
  let freshResetApplied = 0;

  if (forceFreshReset && rowsForCeo.length > 0) {
    notes.push(
      "forceFreshReset=true — in-memory fresh-new workflow reset + Breezy/cache refresh before CEO score (no durable write).",
    );
    const byId = new Map(breezyForCeo.map((c) => [c.candidateId, c]));
    const nextRows = [];
    for (const row of rowsForCeo) {
      const seed = byId.get(row.candidateId) ?? null;
      const result = await refreshBreezyCandidateData(row.candidateId, {
        seed,
        allowNetwork: true,
      });
      if (result.candidate) {
        byId.set(row.candidateId, result.candidate);
        notes.push(
          `forceFreshReset ${redact(row.candidateId)}: breezy=${result.source} — ${result.note}`,
        );
      } else {
        notes.push(
          `forceFreshReset ${redact(row.candidateId)}: breezy refresh failed — ${result.note}`,
        );
      }

      const beforeWorkflow: CandidateWorkflowRecord = {
        candidateId: row.candidateId,
        workflowStatus: row.workflowStatus,
        assignedRecruiter: row.assignedRecruiter,
        assignedDM: row.assignedDM,
        notes: row.notes ?? [],
        history: row.history ?? [],
        lastActionAt: row.lastActionAt ?? null,
        nextActionNeeded: row.nextActionNeeded,
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt ?? null,
        snoozedUntil: row.snoozedUntil ?? null,
        paperworkStatus: row.paperworkStatus,
        signatureRequestId: row.signatureRequestId ?? null,
        paperworkTemplateKey: row.paperworkTemplateKey ?? null,
        paperworkSentAt: row.paperworkSentAt ?? null,
        paperworkViewedAt: row.paperworkViewedAt ?? null,
        paperworkViewCount: row.paperworkViewCount ?? 0,
        paperworkSignedAt: row.paperworkSignedAt ?? null,
        paperworkError: row.paperworkError ?? null,
        onboardingContactEmail: row.onboardingContactEmail ?? null,
        directDepositStatus: row.directDepositStatus,
        directDepositRequestedAt: row.directDepositRequestedAt ?? null,
        directDepositLastReminderAt: row.directDepositLastReminderAt ?? null,
        directDepositNotes: row.directDepositNotes ?? null,
        directDepositTriggeredByUserId: row.directDepositTriggeredByUserId ?? null,
        directDepositLastDeliveryMode: row.directDepositLastDeliveryMode ?? null,
        directDepositLastHrCopyIncluded: row.directDepositLastHrCopyIncluded ?? null,
        directDepositLastHrBccAddress: row.directDepositLastHrBccAddress ?? null,
        updatedAt: row.updatedDate || new Date().toISOString(),
        actionType: row.actionType,
        requiredAction: row.requiredAction,
        actionReason: row.actionReason,
        actionDueDate: row.actionDueDate,
        actionGeneratedAt: row.actionGeneratedAt,
        actionPriority: row.actionPriority,
        actionConfidence: row.actionConfidence,
        recommendedStage: row.recommendedStage,
        progressionReason: row.progressionReason,
        progressionConfidence: row.progressionConfidence,
        progressionPriority: row.progressionPriority,
        progressionGeneratedAt: row.progressionGeneratedAt,
        recruiterAssignmentSource: row.recruiterAssignmentSource,
        recruiterAssignmentReason: row.recruiterAssignmentReason,
        recruiterAssignmentConfidence: row.recruiterAssignmentConfidence,
        recruiterAssignedAt: row.recruiterAssignedAt,
      };
      const resetWorkflow = resetToFreshNewState(beforeWorkflow);
      const validation = validateP240FreshNewReset({
        before: beforeWorkflow,
        after: resetWorkflow,
      });
      if (!validation.hashMismatch) {
        freshResetApplied += 1;
        notes.push(`Fresh Reset Applied for ${redact(row.candidateId)}`);
      } else {
        notes.push(
          `Fresh Reset incomplete for ${redact(row.candidateId)} leftover=${validation.leftoverStaleFields.join(",") || "hash drift"}`,
        );
      }

      const fresh = byId.get(row.candidateId);
      nextRows.push(
        fresh ? buildScoredWorkflowRow(fresh, resetWorkflow) : buildScoredWorkflowRow(
          {
            candidateId: row.candidateId,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            city: row.city,
            state: row.state,
            zipCode: row.zipCode,
            positionId: row.positionId,
            positionName: row.positionName,
            stage: row.stage,
            source: row.source,
            appliedDate: row.appliedDate,
            createdDate: row.createdDate,
            addedDate: row.addedDate,
            updatedDate: row.updatedDate,
            addedDateSource: row.addedDateSource,
            resumeText: row.resumeText,
            hasResume: row.hasResume,
          } as BreezyCandidate,
          resetWorkflow,
        ),
      );
    }
    breezyForCeo = [...byId.values()];
    rowsForCeo = nextRows;
    notes.push(
      `Fresh Reset Applied count=${freshResetApplied}/${pulled.rows.length} (forceFreshReset in-memory only).`,
    );
  }

  const candidates: AutonomousCandidateResult[] = [];
  const failuresDetail: Array<{ candidateId: string; error: string }> = [];

  const ceo = await orchestrate({
    rows: rowsForCeo,
    breezyCandidates: breezyForCeo,
    options: {
      dryRun: true, // CEO itself never writes
      useLLMEnhancement,
      batchId,
    },
  });

  const decisionById = new Map(ceo.decisions.map((d) => [d.candidateId, d]));
  const tasksByCandidate = new Map<string, number>();
  for (const task of ceo.paperworkTasks) {
    tasksByCandidate.set(task.candidateId, (tasksByCandidate.get(task.candidateId) ?? 0) + 1);
  }

  let skippedIdempotent = 0;
  let skippedAlreadySent = 0;
  let skippedStateMachine = 0;
  let skippedCanaryCap = 0;
  let paperworkPlanned = 0;
  let paperworkSent = 0;
  let breezyStageUpdatesPlanned = 0;
  let breezyStageUpdatesApplied = 0;
  let canarySendsUsed = 0;
  let autoAdvance = 0;
  let humanReview = 0;
  let autoReject = 0;

  for (const row of rowsForCeo) {
    const decision = decisionById.get(row.candidateId);
    try {
      const email = row.email ?? row.onboardingContactEmail ?? null;
      const emailFingerprint = normalizeEmailFingerprint(email);

      // 1) Never send twice — store + workflow state
      const alreadySent = hasAlreadySentPaperwork(idempotency, row.candidateId, email);
      if (alreadySent.blocked || isNeverSendTwiceBlocked(row)) {
        skippedAlreadySent += 1;
        const reason = alreadySent.reason ?? evaluateP243StateMachine(row) ?? "already_sent";
        skipReasonSamples.push(reason);
        candidates.push(
          emptyCandidateResult({
            row,
            outcome: "skipped_already_sent",
            skipReason: reason,
            ceoTraceId: ceo.traceId,
            p204Recommendation: decision?.p204Recommendation ?? null,
            confidence: decision?.confidence ?? null,
          }),
        );
        continue;
      }

      // 2) State machine gate before re-scoring / acting on decision
      const smBlock = evaluateP243StateMachine(row);
      if (smBlock) {
        skippedStateMachine += 1;
        skipReasonSamples.push(smBlock);
        candidates.push(
          emptyCandidateResult({
            row,
            outcome: "skipped_state_machine",
            skipReason: smBlock,
            ceoTraceId: ceo.traceId,
            p204Recommendation: decision?.p204Recommendation ?? null,
            confidence: decision?.confidence ?? null,
          }),
        );
        continue;
      }

      if (!decision) {
        throw new Error("CEO decision missing for candidate");
      }

      const fingerprint = buildP243Fingerprint({
        candidateId: row.candidateId,
        email,
        workflowStatus: row.workflowStatus,
        paperworkStatus: String(row.paperworkStatus ?? "not_sent"),
        signatureRequestId: row.signatureRequestId ?? null,
        recommendation: decision.p204Recommendation ?? "none",
      });

      if (respectIdempotency && shouldSkipIdempotent(idempotency, row.candidateId, fingerprint)) {
        skippedIdempotent += 1;
        skipReasonSamples.push("fingerprint_match");
        candidates.push(
          emptyCandidateResult({
            row,
            outcome: "skipped_idempotent",
            skipReason: "fingerprint_match",
            ceoTraceId: ceo.traceId,
            p204Recommendation: decision.p204Recommendation,
            confidence: decision.confidence,
          }),
        );
        continue;
      }

      const plannedTasks = tasksByCandidate.get(row.candidateId) ?? 0;
      let paperworkExecuted = false;
      let breezyStageUpdatePlanned = false;
      let breezyStageUpdated = false;
      let outcome: AutonomousCandidateResult["outcome"] = decision.outcome;
      let skipReason: string | null = null;

      if (decision.outcome === "auto_advance") {
        autoAdvance += 1;
        paperworkPlanned += plannedTasks;
        breezyStageUpdatePlanned = true;
        breezyStageUpdatesPlanned += 1;

        const canaryBlocked =
          liveExecute && !fullLive && canarySendsUsed >= canaryLimit;

        if (canaryBlocked) {
          skippedCanaryCap += 1;
          outcome = "skipped_canary_cap";
          skipReason = `canary_cap:${canaryLimit}`;
          skipReasonSamples.push(skipReason);
          notes.push(
            `Canary cap reached (${canaryLimit}); skipped live send for ${redact(row.candidateId)}.`,
          );
        } else if (liveExecute) {
          const cycle = await runPaperworkCycle({
            dryRun: false,
            execute: true,
            candidateId: row.candidateId,
            cycleId: `${batchId}:${row.candidateId}`,
            byUserId: options.byUserId ?? "p243-autonomous-cycle",
          });
          const sent =
            cycle.report.execution?.executed === true &&
            cycle.report.execution?.outcome === "sent";
          if (sent) {
            paperworkSent += 1;
            paperworkExecuted = true;
            canarySendsUsed += 1;
          } else if (cycle.report.execution?.error) {
            throw new Error(cycle.report.execution.error);
          }
          notes.push(
            `Live paperwork cycle for ${redact(row.candidateId)}: outcome=${cycle.report.execution?.outcome ?? "unknown"}`,
          );
        } else {
          notes.push(
            `Dry-run: planned ${plannedTasks} paperwork task(s) for ${redact(row.candidateId)} (P123/Dropbox not invoked).`,
          );
        }
      } else if (decision.outcome === "human_review") {
        humanReview += 1;
      } else if (decision.outcome === "auto_reject") {
        autoReject += 1;
      }

      const result: AutonomousCandidateResult = {
        candidateId: row.candidateId,
        redactedCandidateId: redact(row.candidateId),
        name: displayName(row),
        positionId: row.positionId ?? null,
        appliedAt: row.appliedDate ?? row.createdDate ?? null,
        outcome,
        p204Recommendation: decision.p204Recommendation,
        confidence: decision.confidence,
        paperworkTasksPlanned: plannedTasks,
        paperworkExecuted,
        breezyStageUpdatePlanned,
        breezyStageUpdated,
        skipReason,
        error: null,
        ceoTraceId: ceo.traceId,
      };
      candidates.push(result);

      // Persist idempotency only for real processing outcomes — not canary-cap skips
      // (those must remain eligible on a later cycle).
      if (!dryRun && outcome !== "skipped_canary_cap") {
        idempotency = recordIdempotent(idempotency, {
          candidateId: row.candidateId,
          emailFingerprint,
          fingerprint,
          outcome,
          paperworkSent: paperworkExecuted,
          signatureRequestId: paperworkExecuted
            ? (row.signatureRequestId ?? `p243-sent:${batchId}:${row.candidateId}`)
            : (row.signatureRequestId ?? null),
          processedAt: new Date().toISOString(),
          batchId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failuresDetail.push({ candidateId: row.candidateId, error: message });
      skipReasonSamples.push(message.slice(0, 80));
      candidates.push(
        emptyCandidateResult({
          row,
          outcome: "error",
          skipReason: null,
          ceoTraceId: ceo.traceId,
          p204Recommendation: decision?.p204Recommendation ?? null,
          confidence: decision?.confidence ?? null,
          error: message,
        }),
      );
    }
  }

  const checkedAt = new Date().toISOString();
  if (!dryRun) {
    idempotency = touchLastChecked(idempotency, checkedAt);
    await saveP243IdempotencyStore(idempotency);
    notes.push("Idempotency store updated (live mode only).");
  } else {
    notes.push("Idempotency lastCheckedAt not persisted (dry-run).");
  }

  const scored = ceo.evaluated;
  const advanceRatePct =
    scored > 0 ? Math.round((autoAdvance / scored) * 1000) / 10 : 0;
  const successDenom = Math.max(1, pulled.pulled);
  const successRatePct =
    Math.round(
      ((pulled.pulled - failuresDetail.length) / successDenom) * 1000,
    ) / 10;

  const warnings = buildWarnings({
    scored,
    autoAdvance,
    humanReview,
    failures: failuresDetail.length,
    executionMode,
    preflightOk: preflight.ok || dryRun,
  });

  const report: AutonomousCycleReport = {
    sourcePhase: P243_SOURCE_PHASE,
    schemaVersion: P243_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    dryRun,
    executionMode,
    useLLMEnhancement,
    batchId,
    ceoTraceId: ceo.traceId,
    pulled: pulled.pulled,
    scored,
    autoAdvance,
    humanReview,
    autoReject,
    skippedIdempotent,
    skippedAlreadySent,
    skippedStateMachine,
    skippedCanaryCap,
    paperworkPlanned,
    paperworkSent,
    breezyStageUpdatesPlanned,
    breezyStageUpdatesApplied,
    failures: failuresDetail.length,
    averageLatencyMs: Math.round((Date.now() - started) / Math.max(1, pulled.pulled || 1)),
    advanceRatePct,
    successRatePct,
    reviewQueueDepth: humanReview,
    commonFailureReasons: tallyFailureReasons(failuresDetail, skipReasonSamples),
    warnings,
    preflight: preflight.checks,
    ingestion: {
      ...pulled.ingestion,
      lastCheckedAt: dryRun ? pulled.ingestion.lastCheckedAt : checkedAt,
    },
    candidates,
    failuresDetail,
    notes,
    idempotencyStorePath: p243IdempotencyStorePath(),
    freshResetApplied,
    auditTraceLinks: {
      ceoTraceId: ceo.traceId,
      batchId,
      evaluationPreviewPath: `/api/recruiting/evaluation-preview?traceId=${encodeURIComponent(ceo.traceId)}`,
    },
  };

  return report;
}
