import { runAutonomousRecruitingCycle } from "@/lib/autonomous-recruiting-pipeline";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  assertLivePilotEnvForExecute,
  ensurePilotMaxSendsForCanary,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import {
  isCapacityExhausted,
  probeDropboxSendCapacity,
} from "@/lib/p243-open-store-bulk-paperwork-queue/capacity";
import {
  dedupeQueueByCandidateId,
  prepareEligibleForPaperworkSend,
} from "@/lib/p243-open-store-bulk-paperwork-queue/prepare";
import type { P243OsbpqQueueItem } from "@/lib/p243-open-store-bulk-paperwork-queue/types";
import { formatP244ReconciliationMarkdown } from "@/lib/p244-open-store-applicant-reconciliation/format";
import { recommendedActionForCategory } from "@/lib/p244-open-store-applicant-reconciliation/map-category";
import { reconcileOpenStoreApplicants } from "@/lib/p244-open-store-applicant-reconciliation/reconcile";
import {
  P244_OSAR_BATCH_SIZE,
  P244_OSAR_CONFIRMATION_PHRASE,
  P244_OSAR_PHASE,
  type P244ConfirmedSend,
  type P244FullReconciliationReport,
  type P244RunOptions,
} from "@/lib/p244-open-store-applicant-reconciliation/types";

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
 * Steps 1–6: reconcile all 81, recover, freeze eligible, send ≤5 batches.
 */
export async function runP244OpenStoreApplicantReconciliation(
  options: P244RunOptions,
): Promise<{
  report: P244FullReconciliationReport;
  markdown: string;
}> {
  const batchSize = Math.max(
    1,
    Math.min(options.batchSize ?? P244_OSAR_BATCH_SIZE, P244_OSAR_BATCH_SIZE),
  );
  const dryRunRequested = options.dryRun !== false;
  const confirmLive = options.confirmLive === true;
  const executeRequested = options.execute === true && !dryRunRequested && confirmLive;
  const forceAutoAdvance = options.forceAutoAdvance === true;
  const forceFreshReset = options.forceFreshReset !== false;
  const confirmationPhrase =
    options.confirmationPhrase?.trim() ||
    P244_OSAR_CONFIRMATION_PHRASE ||
    P122_CONFIRMATION_PHRASE;

  const { reportBase, notes, warnings } = await reconcileOpenStoreApplicants({
    xlsxPath: options.xlsxPath,
    approveOver60Ids: options.approveOver60Ids,
    verifyDropbox: options.verifyDropbox,
    persistRecovery: executeRequested || options.dryRun === false,
  });

  let dropboxTestMode = reportBase.dropboxTestMode;
  try {
    dropboxTestMode = readDropboxSignConfig()?.testMode ?? dropboxTestMode;
  } catch {
    /* keep */
  }

  let capacity = reportBase.capacity;
  const newConfirmedSends: P244ConfirmedSend[] = [];
  let sendsAttempted = 0;
  let stoppedOnSystemFailure = false;
  let systemStopReason: string | null = null;
  let liveWritesOccurred = Boolean(
    reportBase.recovered.some((r) => r.workflowCreatedOrRestored || r.foundInBreezy),
  );
  let batchesAttempted = 0;

  const capacityBlocksLive = capacity.stopAfterPreview || capacity.safeCapacity == null;
  const execute = executeRequested && !capacityBlocksLive;
  const eligibleFoundBeforeSend = reportBase.summary.eligibleApplicantsFound;

  if (executeRequested && capacityBlocksLive) {
    warnings.push(
      "Live execute requested but Dropbox capacity could not be confirmed — STOP after reconcile only.",
    );
    notes.push("STOP after reconcile: capacity unconfirmed or safeCapacity=null.");
  }

  if (!execute) {
    notes.push(
      dryRunRequested
        ? "Reconcile-only / dry-run — no live sends."
        : capacityBlocksLive
          ? "Execute blocked by capacity gate."
          : "Execute skipped (requires dryRun=false + confirmLive=true + execute=true).",
    );
  } else {
    assertLivePilotEnvForExecute();
    if (dropboxTestMode !== true) {
      throw new Error(
        `P244 refused live send: Dropbox testMode must be true (got ${String(dropboxTestMode)}).`,
      );
    }

    const registry = await loadPilotSendRegistry();
    const headroom = ensurePilotMaxSendsForCanary(
      registry.sendCount + reportBase.eligibleQueueItems.length + capacity.safetyReserve,
    );
    notes.push(headroom.message);

    const deduped = dedupeQueueByCandidateId(reportBase.eligibleQueueItems);
    if (deduped.droppedDuplicates > 0) {
      notes.push(`Deduped ${deduped.droppedDuplicates} duplicate candidateId(s) before send.`);
    }

    const prepare = await prepareEligibleForPaperworkSend({
      eligible: deduped.unique,
      persist: true,
    });
    notes.push(...prepare.notes);
    if (prepare.prepared > 0) liveWritesOccurred = true;

    let remaining = [...deduped.unique];

    while (remaining.length > 0) {
      // Recheck capacity before every batch
      capacity = await probeDropboxSendCapacity();
      notes.push(`[batch-capacity] ${capacity.detail}`);

      if (isCapacityExhausted(capacity, newConfirmedSends.length)) {
        notes.push(
          `Auto-stop: safe capacity exhausted after ${newConfirmedSends.length} confirmed send(s).`,
        );
        for (const left of remaining) {
          stampDeferred(reportBase, left.candidateId);
        }
        remaining = [];
        break;
      }

      const headroomLeft = Math.max(
        0,
        (capacity.safeCapacity ?? 0) - newConfirmedSends.length,
      );
      if (headroomLeft <= 0) {
        for (const left of remaining) stampDeferred(reportBase, left.candidateId);
        remaining = [];
        break;
      }

      const take = Math.min(batchSize, headroomLeft);
      const batch = remaining.slice(0, take);
      remaining = remaining.slice(take);

      batchesAttempted += 1;
      const apiBefore = capacity.apiRequestsRemaining;
      notes.push(
        `Batch ${batchesAttempted}: ${batch.length} candidate(s) (cap headroom=${headroomLeft}; remainingAfterTake=${remaining.length}).`,
      );

      const beforeBatch = await recheckEligible(batch);
      notes.push(...beforeBatch.notes);
      const toSend = beforeBatch.stillEligible;
      if (!toSend.length) {
        notes.push(`Batch ${batchesAttempted}: nothing left after recheck.`);
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
          for (const left of [...toSend, ...remaining]) {
            stampDeferred(reportBase, left.candidateId);
          }
          remaining = [];
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
        let hanging = 0;

        for (const member of toSend) {
          sendsAttempted += 1;
          const cycleRow = cycleById.get(member.candidateId) as
            | {
                signatureRequestId?: string | null;
                outcome?: string;
                skipReason?: string | null;
              }
            | undefined;
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
            const capacityAfterProbe = await probeDropboxSendCapacity();
            const row: P244ConfirmedSend = {
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              storeNumber: member.storeNumber,
              project: member.project,
              distanceTier: member.distanceTier,
              idempotencyKey: member.idempotencyKey,
              batchIndex: batchesAttempted,
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
              apiCapacityBefore: apiBefore,
              apiCapacityAfter: capacityAfterProbe.apiRequestsRemaining,
              openStore: member.storeLabel,
              phase: P244_OSAR_PHASE,
            };
            newConfirmedSends.push(row);
            stampConfirmed(reportBase, member.candidateId, row);
            capacity = capacityAfterProbe;
          } else {
            const reason =
              failMsg ??
              skipReason ??
              `unconfirmed outcome=${cycleRow?.outcome ?? "missing"}`;
            const system =
              isSystemFailure(reason) ||
              /missing signature|unconfirmed|without_signatureRequestId/i.test(reason);
            if (system) {
              batchSystemFail = true;
              hanging += 1;
              stoppedOnSystemFailure = true;
              systemStopReason = reason;
              warnings.push(`System/hanging failure on ${member.name}: ${reason}`);
            }
            stampStillBlocked(
              reportBase,
              member.candidateId,
              reason,
              system ? "other_blocked" : "missing_durable_ingestion",
            );
          }
        }

        notes.push(
          `Batch ${batchesAttempted} confirmed=${batchConfirmed}/${toSend.length}; cycle sent=${cycle.paperworkSent} failures=${cycle.failures}.`,
        );

        if (batchSystemFail || hanging > 0) {
          systemStopReason =
            systemStopReason ??
            `Batch ${batchesAttempted}: ${hanging} send(s) lacked confirmed signatureRequestId`;
          warnings.push(systemStopReason);
          for (const left of remaining) {
            stampDeferred(reportBase, left.candidateId);
          }
          remaining = [];
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stoppedOnSystemFailure = true;
        systemStopReason = message;
        warnings.push(`Batch ${batchesAttempted} threw: ${message}`);
        for (const left of [...toSend, ...remaining]) {
          stampDeferred(reportBase, left.candidateId);
        }
        remaining = [];
        break;
      } finally {
        if (prevAllow === undefined) delete process.env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST;
        else process.env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST = prevAllow;
      }

      if (stoppedOnSystemFailure) break;
    }

    notes.push(
      `Send complete: batchesAttempted=${batchesAttempted} confirmed=${newConfirmedSends.length}.`,
    );
  }

  // Refresh summary counts after sends/stamps
  const remaining74 = reportBase.dispositions.filter((d) => d.rowKind === "remaining");
  const categoryCounts = reportBase.summary.categoryCounts;
  for (const key of Object.keys(categoryCounts) as Array<keyof typeof categoryCounts>) {
    categoryCounts[key] = 0;
  }
  for (const d of remaining74) {
    if (d.category === "p243_confirmed_send") continue;
    categoryCounts[d.category] += 1;
  }

  const eligibleRemaining = remaining74.filter(
    (d) => d.category === "eligible_not_sent" || d.category === "api_capacity_deferred",
  );
  const apiDeferred = remaining74.filter((d) => d.category === "api_capacity_deferred");
  const stillBlocked = remaining74.filter(
    (d) =>
      d.category !== "already_sent" &&
      d.category !== "already_signed" &&
      d.category !== "eligible_not_sent" &&
      d.category !== "api_capacity_deferred",
  );
  const alreadySentVerified = remaining74.filter((d) => d.category === "already_sent");

  reportBase.summary = {
    ...reportBase.summary,
    categoryCounts,
    previouslySentAndVerified: categoryCounts.already_sent,
    alreadySigned: categoryCounts.already_signed,
    readyForMelOrActiveInMel: categoryCounts.ready_for_mel + categoryCounts.active_in_mel,
    duplicates: categoryCounts.duplicate_candidate,
    invalidEmails: categoryCounts.invalid_or_missing_email,
    missingIngestionCandidates:
      categoryCounts.missing_durable_ingestion + categoryCounts.candidate_not_found,
    eligibleApplicantsFound: eligibleFoundBeforeSend,
    additionalSendsAttempted: sendsAttempted,
    additionalSendsConfirmed: newConfirmedSends.length,
    deferredDueToApiCapacity: categoryCounts.api_capacity_deferred,
    remainingDropboxSafeCapacity:
      capacity.safeCapacity == null
        ? null
        : Math.max(0, capacity.safeCapacity - newConfirmedSends.length),
    stillRequiringManualAction: stillBlocked.length,
  };

  const report: P244FullReconciliationReport = {
    generatedAt: new Date().toISOString(),
    phase: P244_OSAR_PHASE,
    xlsxPath: reportBase.xlsxPath,
    mode: execute ? "reconcile_and_send" : "reconcile_only",
    dryRun: !execute,
    dropboxTestMode,
    liveWritesOccurred,
    capacity,
    summary: reportBase.summary,
    dispositions: reportBase.dispositions,
    remaining74,
    alreadySentVerified,
    recovered: reportBase.recovered,
    eligibleRemaining,
    newConfirmedSends,
    apiDeferred,
    stillBlocked,
    notes: [...notes, ...reportBase.notes],
    warnings: [...new Set([...warnings, ...reportBase.warnings])],
    stoppedOnSystemFailure,
    systemStopReason,
  };

  // Drop internal-only fields if any leaked — report is clean
  return {
    report,
    markdown: formatP244ReconciliationMarkdown(report),
  };
}

function stampDeferred(
  reportBase: Awaited<ReturnType<typeof reconcileOpenStoreApplicants>>["reportBase"],
  candidateId: string,
): void {
  for (const d of reportBase.dispositions) {
    if (d.breezyCandidateId !== candidateId) continue;
    if (d.rowKind !== "remaining") continue;
    if (d.category === "already_sent" || d.category === "already_signed") continue;
    d.category = "api_capacity_deferred";
    d.reasonNotSent = "eligible_deferred_api_capacity";
    d.canBeSentNow = false;
    d.recommendedNextAction = recommendedActionForCategory("api_capacity_deferred", false);
  }
}

function stampConfirmed(
  reportBase: Awaited<ReturnType<typeof reconcileOpenStoreApplicants>>["reportBase"],
  candidateId: string,
  send: P244ConfirmedSend,
): void {
  for (const d of reportBase.dispositions) {
    if (d.breezyCandidateId !== candidateId) continue;
    d.previouslySent = true;
    d.signatureRequestId = send.signatureRequestId;
    d.paperworkStatus = send.paperworkStatusAfter ?? "sent";
    d.workflowStage = send.workflowStageAfter ?? "Paperwork Sent";
    d.canBeSentNow = false;
    d.eligibilityResult = "blocked";
    d.reasonNotSent = null;
    d.category = "already_sent";
    d.recommendedNextAction = recommendedActionForCategory("already_sent", false);
    d.sendVerification = {
      verified: true,
      signatureRequestId: send.signatureRequestId,
      signerEmailMatch: true,
      packetStatus: "sent",
      packetCancelledOrInvalid: false,
      workflowPaperworkSent: true,
      breezyStageOk: true,
      source: "workflow",
      detail: `P244 confirmed send batch=${send.batchIndex}`,
      reclassifiedTo: null,
    };
  }
}

function stampStillBlocked(
  reportBase: Awaited<ReturnType<typeof reconcileOpenStoreApplicants>>["reportBase"],
  candidateId: string,
  reason: string,
  category: "other_blocked" | "missing_durable_ingestion",
): void {
  for (const d of reportBase.dispositions) {
    if (d.breezyCandidateId !== candidateId) continue;
    if (d.rowKind !== "remaining") continue;
    d.category = category;
    d.reasonNotSent = reason;
    d.canBeSentNow = false;
    d.recommendedNextAction = recommendedActionForCategory(category, false);
    d.blockDetail = [d.blockDetail, reason].filter(Boolean).join("; ");
  }
}
