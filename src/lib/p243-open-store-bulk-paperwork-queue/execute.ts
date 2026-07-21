import { runAutonomousRecruitingCycle } from "@/lib/autonomous-recruiting-pipeline";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  assertLivePilotEnvForExecute,
  ensurePilotMaxSendsForCanary,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { isCapacityExhausted } from "@/lib/p243-open-store-bulk-paperwork-queue/capacity";
import { formatP243OsbpqFinalMarkdown } from "@/lib/p243-open-store-bulk-paperwork-queue/format";
import {
  dedupeQueueByCandidateId,
  prepareEligibleForPaperworkSend,
} from "@/lib/p243-open-store-bulk-paperwork-queue/prepare";
import { buildP243OsbpqPreview } from "@/lib/p243-open-store-bulk-paperwork-queue/preview";
import {
  P243_OSBPQ_BATCH_SIZE,
  P243_OSBPQ_CONFIRMATION_PHRASE,
  P243_OSBPQ_PHASE,
  type P243OsbpqFinalReport,
  type P243OsbpqQueueItem,
  type P243OsbpqRunOptions,
  type P243OsbpqSendRow,
} from "@/lib/p243-open-store-bulk-paperwork-queue/types";

const SYSTEM_FAILURE_PATTERNS = [
  /dropbox/i,
  /duplicate protection/i,
  /idempotency.*fail/i,
  /persist/i,
  /neon/i,
  /database/i,
  /storage.*fail/i,
  /ECONNRESET/i,
  /fetch failed/i,
  /429/,
  /rate limit/i,
  /quota/i,
  /preflight/i,
  /workflow.*fail/i,
];

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isSystemFailure(message: string): boolean {
  return SYSTEM_FAILURE_PATTERNS.some((re) => re.test(message));
}

function toDeferredRow(
  item: P243OsbpqQueueItem,
  batchIndex: number,
  reason = "eligible_deferred_api_capacity",
): P243OsbpqSendRow {
  return {
    candidateId: item.candidateId,
    name: item.name,
    email: item.email,
    storeLabel: item.storeLabel,
    storeNumber: item.storeNumber,
    project: item.project,
    distanceTier: item.distanceTier,
    idempotencyKey: item.idempotencyKey,
    batchIndex,
    attempted: false,
    confirmed: false,
    failed: false,
    deferred: true,
    deferReason: reason,
    failureClass: null,
    failureReason: null,
    signatureRequestId: null,
    paperworkStatusAfter: null,
    workflowStageAfter: null,
    skipReason: null,
  };
}

function toSystemFailureRow(
  item: P243OsbpqQueueItem,
  batchIndex: number,
  reason: string,
): P243OsbpqSendRow {
  return {
    candidateId: item.candidateId,
    name: item.name,
    email: item.email,
    storeLabel: item.storeLabel,
    storeNumber: item.storeNumber,
    project: item.project,
    distanceTier: item.distanceTier,
    idempotencyKey: item.idempotencyKey,
    batchIndex,
    attempted: true,
    confirmed: false,
    failed: true,
    deferred: false,
    deferReason: null,
    failureClass: "system",
    failureReason: reason,
    signatureRequestId: null,
    paperworkStatusAfter: null,
    workflowStageAfter: null,
    skipReason: null,
  };
}

async function recheckEligible(
  frozen: P243OsbpqQueueItem[],
): Promise<{ stillEligible: P243OsbpqQueueItem[]; notes: string[] }> {
  const notes: string[] = [];
  const workflows = await getCandidateWorkflowState();
  const still: P243OsbpqQueueItem[] = [];
  for (const c of frozen) {
    const wf = workflows[c.candidateId];
    const stage = String(wf?.workflowStatus ?? c.workflowStage);
    const paperwork = String(wf?.paperworkStatus ?? c.paperworkStatus);
    const sig = String(wf?.signatureRequestId ?? "").trim();
    const sentAt = String(wf?.paperworkSentAt ?? "").trim();
    const hasLivePacket =
      Boolean(sig) ||
      paperwork === "sent" ||
      paperwork === "viewed" ||
      paperwork === "signed" ||
      Boolean(sentAt);
    if (hasLivePacket || stage === "Signed" || stage === "Ready for MEL") {
      notes.push(
        `Recheck excluded ${c.name} (${c.candidateId}): stage=${stage} paperwork=${paperwork}`,
      );
      continue;
    }
    still.push(c);
  }
  return { stillEligible: still, notes };
}

/**
 * Preview first, then optionally execute eligible cohort in batches of ≤5
 * via autonomous recruiting cycle → runPaperworkCycle (Dropbox Sign / P123 path).
 * Never exceeds safe capacity; auto-stops on quota/429/system failures.
 */
export async function runP243OpenStoreBulkPaperworkQueue(
  options: P243OsbpqRunOptions,
): Promise<{
  preview: Awaited<ReturnType<typeof buildP243OsbpqPreview>>;
  final: P243OsbpqFinalReport;
  finalMarkdown: string;
}> {
  const batchSize = Math.max(
    1,
    Math.min(options.batchSize ?? P243_OSBPQ_BATCH_SIZE, P243_OSBPQ_BATCH_SIZE),
  );
  const dryRunRequested = options.dryRun !== false;
  const confirmLive = options.confirmLive === true;
  const executeRequested = options.execute === true && !dryRunRequested && confirmLive;
  const forceAutoAdvance = options.forceAutoAdvance === true;
  const forceFreshReset = options.forceFreshReset !== false;
  const confirmationPhrase =
    options.confirmationPhrase?.trim() ||
    P243_OSBPQ_CONFIRMATION_PHRASE ||
    P122_CONFIRMATION_PHRASE;

  const notes: string[] = [];
  const warnings: string[] = [];

  const preview = await buildP243OsbpqPreview({
    xlsxPath: options.xlsxPath,
    approveOver60Ids: options.approveOver60Ids,
  });
  notes.push(...preview.report.notes);
  warnings.push(...preview.report.warnings);

  let dropboxTestMode: boolean | null = preview.report.dropboxTestMode;
  try {
    dropboxTestMode = readDropboxSignConfig()?.testMode ?? dropboxTestMode;
  } catch {
    /* keep */
  }

  const capacity = preview.report.capacity;
  const previewDeferred = preview.deferred.map((item) => toDeferredRow(item, 0));

  const confirmed: P243OsbpqSendRow[] = [];
  const deferred: P243OsbpqSendRow[] = [...previewDeferred];
  const failures: P243OsbpqSendRow[] = [];
  let batchesAttempted = 0;
  let stoppedOnSystemFailure = false;
  let systemStopReason: string | null = null;
  let liveWritesOccurred = false;

  const capacityBlocksLive = capacity.stopAfterPreview || capacity.safeCapacity == null;
  const execute = executeRequested && !capacityBlocksLive;

  if (executeRequested && capacityBlocksLive) {
    warnings.push(
      "Live execute requested but Dropbox capacity could not be confirmed — STOP after preview only.",
    );
    notes.push("STOP after preview: capacity unconfirmed or safeCapacity=null.");
  }

  if (!execute) {
    notes.push(
      dryRunRequested
        ? "Preview-only / dry-run — no live sends."
        : capacityBlocksLive
          ? "Execute blocked by capacity gate."
          : "Execute skipped (requires dryRun=false + confirmLive=true + execute=true).",
    );
  } else {
    assertLivePilotEnvForExecute();
    if (dropboxTestMode !== true) {
      throw new Error(
        `P243 OSBPQ refused live send: Dropbox testMode must be true (got ${String(dropboxTestMode)}).`,
      );
    }

    const registry = await loadPilotSendRegistry();
    const headroom = ensurePilotMaxSendsForCanary(
      registry.sendCount + preview.eligible.length + capacity.safetyReserve,
    );
    notes.push(headroom.message);

    const deduped = dedupeQueueByCandidateId(preview.eligible);
    if (deduped.droppedDuplicates > 0) {
      notes.push(
        `Deduped ${deduped.droppedDuplicates} duplicate candidateId row(s) before send.`,
      );
    }

    const prepare = await prepareEligibleForPaperworkSend({
      eligible: deduped.unique,
      persist: true,
    });
    notes.push(...prepare.notes);
    if (prepare.prepared > 0) liveWritesOccurred = true;

    let remaining = [...deduped.unique];
    const batches = chunk(remaining, batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      if (isCapacityExhausted(capacity, confirmed.length)) {
        notes.push(
          `Auto-stop: safe capacity exhausted after ${confirmed.length} confirmed send(s).`,
        );
        for (const left of remaining) {
          deferred.push(toDeferredRow(left, batchIndex + 1));
        }
        remaining = [];
        break;
      }

      const headroomLeft = Math.max(0, (capacity.safeCapacity ?? 0) - confirmed.length);
      if (headroomLeft <= 0) {
        for (const left of remaining) {
          deferred.push(toDeferredRow(left, batchIndex + 1));
        }
        remaining = [];
        break;
      }

      const batch = batches[batchIndex]!.slice(0, headroomLeft);
      const skippedForCap = batches[batchIndex]!.slice(headroomLeft);
      for (const s of skippedForCap) {
        deferred.push(toDeferredRow(s, batchIndex + 1));
      }

      batchesAttempted += 1;
      notes.push(`Batch ${batchIndex + 1}: ${batch.length} candidate(s) (cap headroom=${headroomLeft}).`);

      const beforeBatch = await recheckEligible(batch);
      notes.push(...beforeBatch.notes);
      const toSend = beforeBatch.stillEligible;
      if (!toSend.length) {
        notes.push(`Batch ${batchIndex + 1}: nothing left after recheck.`);
        remaining = remaining.filter((r) => !batch.some((b) => b.candidateId === r.candidateId));
        continue;
      }

      const positionIds = [
        ...new Set(toSend.map((c) => c.positionId).filter((id): id is string => Boolean(id))),
      ];
      const allowlist = toSend.map((c) => c.candidateId).join(",");
      const prevAllow = process.env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST;
      process.env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST = [prevAllow, allowlist]
        .filter(Boolean)
        .join(",");

      try {
        const cycle = await runAutonomousRecruitingCycle({
          dryRun: false,
          confirmLive: true,
          canaryLimit: toSend.length,
          fullLive: false,
          limit: Math.min(100, Math.max(toSend.length * 3, 20)),
          positionIds,
          forceFreshReset,
          forceAutoAdvance,
          respectIdempotency: true,
          confirmationPhrase,
          enableSmartPoll: false,
          preferWebhooks: false,
        });

        if (cycle.dryRun) {
          stoppedOnSystemFailure = true;
          systemStopReason =
            "Paperwork cycle remained dry-run after live request (preflight/confirm).";
          warnings.push(systemStopReason);
          for (const member of toSend) {
            failures.push(toSystemFailureRow(member, batchIndex + 1, systemStopReason));
          }
          // Defer everyone not yet attempted
          remaining = remaining.filter(
            (r) => !toSend.some((t) => t.candidateId === r.candidateId),
          );
          for (const left of remaining) {
            deferred.push(toDeferredRow(left, batchIndex + 1));
          }
          break;
        }
        liveWritesOccurred = true;

        const workflowsAfter = await getCandidateWorkflowState();
        const cycleById = new Map(cycle.candidates.map((c) => [c.candidateId, c]));
        const failureById = new Map(
          cycle.failuresDetail.map((f) => [f.candidateId, f.error]),
        );

        let batchConfirmed = 0;
        let batchSystemFail = false;

        for (const member of toSend) {
          const cycleRow = cycleById.get(member.candidateId);
          const wf = workflowsAfter[member.candidateId];
          const sig =
            String(wf?.signatureRequestId ?? "").trim() ||
            String(cycleRow?.signatureRequestId ?? "").trim() ||
            null;
          const paperworkAfter = String(wf?.paperworkStatus ?? "");
          const stageAfter = String(wf?.workflowStatus ?? "");
          const sendConfirmed =
            Boolean(sig) &&
            (paperworkAfter === "sent" ||
              paperworkAfter === "viewed" ||
              stageAfter === "Paperwork Sent" ||
              cycleRow?.outcome === "auto_advance");

          const failMsg = failureById.get(member.candidateId) ?? null;
          const skipReason = cycleRow?.skipReason ?? null;

          if (sendConfirmed && sig) {
            batchConfirmed += 1;
            confirmed.push({
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              storeNumber: member.storeNumber,
              project: member.project,
              distanceTier: member.distanceTier,
              idempotencyKey: member.idempotencyKey,
              batchIndex: batchIndex + 1,
              attempted: true,
              confirmed: true,
              failed: false,
              deferred: false,
              deferReason: null,
              failureClass: null,
              failureReason: null,
              signatureRequestId: sig,
              paperworkStatusAfter: paperworkAfter || null,
              workflowStageAfter: stageAfter || null,
              skipReason: null,
            });
          } else if (
            failMsg ||
            cycleRow?.outcome === "failed" ||
            (!sendConfirmed && cycleRow?.outcome === "auto_advance" && !sig)
          ) {
            const reason =
              failMsg ?? skipReason ?? "send_not_confirmed_without_signatureRequestId";
            const system = isSystemFailure(reason) || /missing signature/i.test(reason);
            failures.push({
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              storeNumber: member.storeNumber,
              project: member.project,
              distanceTier: member.distanceTier,
              idempotencyKey: member.idempotencyKey,
              batchIndex: batchIndex + 1,
              attempted: true,
              confirmed: false,
              failed: true,
              deferred: false,
              deferReason: null,
              failureClass: system ? "system" : "candidate",
              failureReason: reason,
              signatureRequestId: sig,
              paperworkStatusAfter: paperworkAfter || null,
              workflowStageAfter: stageAfter || null,
              skipReason,
            });
            if (system) {
              batchSystemFail = true;
              stoppedOnSystemFailure = true;
              systemStopReason = reason;
              warnings.push(`System failure on ${member.name}: ${reason}`);
            }
          } else if (skipReason || cycleRow?.outcome?.startsWith("skipped")) {
            failures.push({
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              storeNumber: member.storeNumber,
              project: member.project,
              distanceTier: member.distanceTier,
              idempotencyKey: member.idempotencyKey,
              batchIndex: batchIndex + 1,
              attempted: true,
              confirmed: false,
              failed: true,
              deferred: false,
              deferReason: null,
              failureClass: "candidate",
              failureReason: skipReason ?? cycleRow?.outcome ?? "skipped",
              signatureRequestId: sig,
              paperworkStatusAfter: paperworkAfter || null,
              workflowStageAfter: stageAfter || null,
              skipReason,
            });
          } else {
            const reason = `unconfirmed outcome=${cycleRow?.outcome ?? "missing"}`;
            failures.push({
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              storeNumber: member.storeNumber,
              project: member.project,
              distanceTier: member.distanceTier,
              idempotencyKey: member.idempotencyKey,
              batchIndex: batchIndex + 1,
              attempted: true,
              confirmed: false,
              failed: true,
              deferred: false,
              deferReason: null,
              failureClass: "candidate",
              failureReason: reason,
              signatureRequestId: sig,
              paperworkStatusAfter: paperworkAfter || null,
              workflowStageAfter: stageAfter || null,
              skipReason,
            });
          }
        }

        notes.push(
          `Batch ${batchIndex + 1} confirmed=${batchConfirmed}/${toSend.length}; cycle sent=${cycle.paperworkSent} failures=${cycle.failures}.`,
        );

        remaining = remaining.filter(
          (r) => !batch.some((b) => b.candidateId === r.candidateId),
        );

        const batchFailed = failures.filter((f) => f.batchIndex === batchIndex + 1);
        const systemFails = batchFailed.filter((f) => f.failureClass === "system");
        const hanging = batchFailed.filter((f) =>
          /unconfirmed|not_confirmed|without_signatureRequestId/i.test(f.failureReason ?? ""),
        );

        // Auto-stop on system / hanging / missing signature. Candidate-level
        // failures (already-sent onboarding, skip reasons) do not block later batches.
        if (systemFails.length > 0 || hanging.length > 0 || batchSystemFail) {
          stoppedOnSystemFailure = true;
          systemStopReason =
            systemStopReason ??
            (hanging.length
              ? `Batch ${batchIndex + 1}: ${hanging.length} send(s) lacked confirmed signatureRequestId`
              : `Batch ${batchIndex + 1}: system failure`);
          warnings.push(systemStopReason);
          for (const left of remaining) {
            deferred.push(toDeferredRow(left, batchIndex + 1));
          }
          remaining = [];
          break;
        }

        if (batchFailed.length > 0) {
          notes.push(
            `Batch ${batchIndex + 1}: ${batchFailed.length} candidate-level failure(s); continuing remaining queue.`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stoppedOnSystemFailure = true;
        systemStopReason = message;
        warnings.push(`Batch ${batchIndex + 1} threw: ${message}`);
        for (const member of toSend) {
          failures.push({
            candidateId: member.candidateId,
            name: member.name,
            email: member.email,
            storeLabel: member.storeLabel,
            storeNumber: member.storeNumber,
            project: member.project,
            distanceTier: member.distanceTier,
            idempotencyKey: member.idempotencyKey,
            batchIndex: batchIndex + 1,
            attempted: true,
            confirmed: false,
            failed: true,
            deferred: false,
            deferReason: null,
            failureClass: "system",
            failureReason: message,
            signatureRequestId: null,
            paperworkStatusAfter: null,
            workflowStageAfter: null,
            skipReason: null,
          });
        }
        remaining = remaining.filter(
          (r) => !toSend.some((t) => t.candidateId === r.candidateId),
        );
        for (const left of remaining) {
          deferred.push(toDeferredRow(left, batchIndex + 1));
        }
        break;
      } finally {
        if (prevAllow === undefined) delete process.env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST;
        else process.env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST = prevAllow;
      }

      if (stoppedOnSystemFailure) break;
    }
  }

  const s = preview.report.summary;
  const final: P243OsbpqFinalReport = {
    generatedAt: new Date().toISOString(),
    phase: P243_OSBPQ_PHASE,
    xlsxPath: options.xlsxPath,
    mode: execute ? "live_batches" : "preview_only",
    dryRun: !execute,
    dropboxTestMode,
    liveWritesOccurred,
    forceAutoAdvance,
    forceFreshReset,
    batchSize,
    batchesAttempted,
    stoppedOnSystemFailure,
    systemStopReason,
    capacity,
    summary: {
      reviewed: s.reviewed,
      eligible: s.eligible,
      alreadySent: s.alreadySent,
      alreadySigned: s.alreadySigned,
      duplicates: s.duplicates,
      invalidEmail: s.invalidEmail,
      blocked: s.blocked,
      apiRemaining: capacity.apiRequestsRemaining,
      safeCapacity: capacity.safeCapacity,
      wouldSend: s.wouldSend,
      attempted: confirmed.length + failures.length,
      confirmedSends: confirmed.length,
      deferred: deferred.length,
      failed: failures.length,
    },
    preview: s,
    confirmed,
    deferred,
    failures,
    notes,
    warnings: [...new Set(warnings)],
  };

  return {
    preview,
    final,
    finalMarkdown: formatP243OsbpqFinalMarkdown(final),
  };
}
