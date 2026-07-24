import { runAutonomousRecruitingCycle } from "@/lib/autonomous-recruiting-pipeline";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  assertLivePilotEnvForExecute,
  ensurePilotMaxSendsForCanary,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { assignP242Ownership } from "@/lib/p242-open-store-paperwork-push/assign";
import { buildP242Preview } from "@/lib/p242-open-store-paperwork-push/preview";
import { formatP242FinalMarkdown } from "@/lib/p242-open-store-paperwork-push/format";
import {
  P242_CONFIRMATION_PHRASE,
  P242_MAX_BATCH,
  P242_PHASE,
  type P242CandidateMatch,
  type P242FinalReport,
  type P242RunOptions,
  type P242SendRow,
} from "@/lib/p242-open-store-paperwork-push/types";

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
  /preflight/i,
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
  frozen: P242CandidateMatch[],
): Promise<{ stillEligible: P242CandidateMatch[]; notes: string[] }> {
  const notes: string[] = [];
  const workflows = await getCandidateWorkflowState();
  const still: P242CandidateMatch[] = [];
  for (const c of frozen) {
    const wf = workflows[c.candidateId];
    const stage = String(wf?.workflowStatus ?? c.workflowStage);
    const paperwork = String(wf?.paperworkStatus ?? c.paperworkStatus);
    const sig = String(wf?.signatureRequestId ?? "").trim();
    if (
      sig ||
      paperwork === "sent" ||
      paperwork === "viewed" ||
      paperwork === "signed" ||
      stage === "Paperwork Sent" ||
      stage === "Signed" ||
      stage === "Ready for MEL"
    ) {
      notes.push(`Recheck excluded ${c.name} (${c.candidateId}): stage=${stage} paperwork=${paperwork}`);
      continue;
    }
    still.push(c);
  }
  return { stillEligible: still, notes };
}

/**
 * Preview first, then optionally execute eligible cohort in batches of ≤10
 * via P243 → runPaperworkCycle (Dropbox Sign / P123 path).
 */
export async function runP242OpenStorePaperworkPush(
  options: P242RunOptions,
): Promise<{
  preview: Awaited<ReturnType<typeof buildP242Preview>>;
  final: P242FinalReport;
  finalMarkdown: string;
}> {
  const batchSize = Math.max(1, Math.min(options.batchSize ?? P242_MAX_BATCH, P242_MAX_BATCH));
  const dryRunRequested = options.dryRun !== false;
  const confirmLive = options.confirmLive === true;
  const execute = options.execute === true && !dryRunRequested && confirmLive;
  const forceAutoAdvance = options.forceAutoAdvance === true;
  const forceFreshReset = options.forceFreshReset !== false;
  const confirmationPhrase =
    options.confirmationPhrase?.trim() || P242_CONFIRMATION_PHRASE || P122_CONFIRMATION_PHRASE;

  const notes: string[] = [];
  const warnings: string[] = [];

  const preview = await buildP242Preview({
    xlsxPath: options.xlsxPath,
    approveOver60Ids: options.approveOver60Ids,
  });
  notes.push(...preview.report.notes);
  warnings.push(...preview.report.warnings);

  let dropboxTestMode: boolean | null = preview.report.dropboxTestMode;
  try {
    dropboxTestMode = readDropboxSignConfig()?.testMode ?? dropboxTestMode;
  } catch {
    /* keep preview value */
  }

  const eligibleFrozen = preview.report.candidates.filter((c) => c.eligibility === "eligible");
  notes.push(`Frozen eligible cohort: ${eligibleFrozen.length}.`);

  const sent: P242SendRow[] = [];
  const failed: P242SendRow[] = [];
  let batchesAttempted = 0;
  let stoppedOnSystemFailure = false;
  let systemStopReason: string | null = null;
  let liveWritesOccurred = false;
  let assignments: P242FinalReport["assignments"] = [];

  if (!execute) {
    notes.push(
      dryRunRequested
        ? "Preview-only / dry-run — no live sends."
        : "Execute skipped (requires dryRun=false + confirmLive=true + execute=true).",
    );
  } else {
    assertLivePilotEnvForExecute();
    if (dropboxTestMode !== true) {
      throw new Error(
        `P242 refused live send: Dropbox testMode must be true (got ${String(dropboxTestMode)}).`,
      );
    }

    const registry = await loadPilotSendRegistry();
    const headroom = ensurePilotMaxSendsForCanary(registry.sendCount + eligibleFrozen.length + 5);
    notes.push(headroom.message);

    const ownership = await assignP242Ownership({
      eligible: eligibleFrozen,
      persist: true,
      assignTaylor: options.assignTaylor !== false,
      assignDm: options.assignDm !== false,
    });
    assignments = ownership.audits;
    notes.push(...ownership.notes);
    liveWritesOccurred = ownership.audits.some((a) => a.applied);

    const recheck = await recheckEligible(eligibleFrozen);
    notes.push(...recheck.notes);
    const batches = chunk(recheck.stillEligible, batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex]!;
      batchesAttempted += 1;
      notes.push(
        `Batch ${batchIndex + 1}/${batches.length}: ${batch.length} candidate(s).`,
      );

      // Recheck again before each batch
      const beforeBatch = await recheckEligible(batch);
      const toSend = beforeBatch.stillEligible;
      notes.push(...beforeBatch.notes);
      if (!toSend.length) {
        notes.push(`Batch ${batchIndex + 1}: nothing left after recheck.`);
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
          // Discovery already used durable ingestion; avoid broad Breezy scans mid-send.
          enableSmartPoll: false,
          preferWebhooks: false,
        });

        if (cycle.dryRun) {
          stoppedOnSystemFailure = true;
          systemStopReason =
            "P243 cycle remained dry-run after live request (preflight/confirm).";
          warnings.push(systemStopReason);
          break;
        }
        liveWritesOccurred = true;

        const workflowsAfter = await getCandidateWorkflowState();
        const cycleById = new Map(cycle.candidates.map((c) => [c.candidateId, c]));
        const failureById = new Map(
          cycle.failuresDetail.map((f) => [f.candidateId, f.error]),
        );

        let batchConfirmed = 0;
        for (const member of toSend) {
          const cycleRow = cycleById.get(member.candidateId);
          const wf = workflowsAfter[member.candidateId];
          const sig =
            String(wf?.signatureRequestId ?? "").trim() ||
            String(cycleRow?.signatureRequestId ?? "").trim() ||
            null;
          const paperworkAfter = String(wf?.paperworkStatus ?? "");
          const stageAfter = String(wf?.workflowStatus ?? "");
          const confirmed =
            Boolean(sig) &&
            (paperworkAfter === "sent" ||
              paperworkAfter === "viewed" ||
              stageAfter === "Paperwork Sent" ||
              cycleRow?.outcome === "auto_advance");

          const failMsg = failureById.get(member.candidateId) ?? null;
          const skipReason = cycleRow?.skipReason ?? null;

          if (confirmed && sig) {
            batchConfirmed += 1;
            sent.push({
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              districtManager: member.districtManager,
              batchIndex: batchIndex + 1,
              attempted: true,
              confirmed: true,
              failed: false,
              failureClass: null,
              failureReason: null,
              signatureRequestId: sig,
              paperworkStatusAfter: paperworkAfter || null,
              workflowStageAfter: stageAfter || null,
              skipReason: null,
            });
          } else if (failMsg || cycleRow?.outcome === "failed" || (!confirmed && cycleRow?.outcome === "auto_advance" && !sig)) {
            const reason = failMsg ?? skipReason ?? "send_not_confirmed_without_signatureRequestId";
            const system = isSystemFailure(reason);
            failed.push({
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              districtManager: member.districtManager,
              batchIndex: batchIndex + 1,
              attempted: true,
              confirmed: false,
              failed: true,
              failureClass: system ? "system" : "candidate",
              failureReason: reason,
              signatureRequestId: sig,
              paperworkStatusAfter: paperworkAfter || null,
              workflowStageAfter: stageAfter || null,
              skipReason,
            });
            if (system) {
              stoppedOnSystemFailure = true;
              systemStopReason = reason;
              warnings.push(`System failure on ${member.name}: ${reason}`);
            }
          } else if (skipReason || cycleRow?.outcome?.startsWith("skipped")) {
            failed.push({
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              districtManager: member.districtManager,
              batchIndex: batchIndex + 1,
              attempted: true,
              confirmed: false,
              failed: true,
              failureClass: "candidate",
              failureReason: skipReason ?? cycleRow?.outcome ?? "skipped",
              signatureRequestId: sig,
              paperworkStatusAfter: paperworkAfter || null,
              workflowStageAfter: stageAfter || null,
              skipReason,
            });
          } else {
            failed.push({
              candidateId: member.candidateId,
              name: member.name,
              email: member.email,
              storeLabel: member.storeLabel,
              districtManager: member.districtManager,
              batchIndex: batchIndex + 1,
              attempted: true,
              confirmed: false,
              failed: true,
              failureClass: "candidate",
              failureReason: `unconfirmed outcome=${cycleRow?.outcome ?? "missing"}`,
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

        if (stoppedOnSystemFailure) break;

        // Continue to next batch only after this batch's Dropbox confirms settle.
        // Candidate-level failures do not stop unrelated later batches; hanging
        // auto_advance without signatureRequestId is treated as system stop.
        const hanging = failed.filter(
          (f) =>
            f.batchIndex === batchIndex + 1 &&
            /unconfirmed|not_confirmed|without_signatureRequestId/i.test(
              f.failureReason ?? "",
            ),
        );
        if (hanging.length > 0) {
          stoppedOnSystemFailure = true;
          systemStopReason = `Batch ${batchIndex + 1}: ${hanging.length} send(s) lacked confirmed signatureRequestId`;
          warnings.push(systemStopReason);
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stoppedOnSystemFailure = true;
        systemStopReason = message;
        warnings.push(`Batch ${batchIndex + 1} threw: ${message}`);
        for (const member of toSend) {
          failed.push({
            candidateId: member.candidateId,
            name: member.name,
            email: member.email,
            storeLabel: member.storeLabel,
            districtManager: member.districtManager,
            batchIndex: batchIndex + 1,
            attempted: true,
            confirmed: false,
            failed: true,
            failureClass: "system",
            failureReason: message,
            signatureRequestId: null,
            paperworkStatusAfter: null,
            workflowStageAfter: null,
            skipReason: null,
          });
        }
        break;
      } finally {
        if (prevAllow === undefined) delete process.env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST;
        else process.env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST = prevAllow;
      }

      if (stoppedOnSystemFailure) break;
    }
  }

  const confirmedIds = new Set(sent.map((s) => s.candidateId));
  const storeCoverage = preview.report.summary.byStore.map((store) => {
    const storeCandidates = preview.report.candidates.filter(
      (c) => c.storeLabel === store.storeLabel,
    );
    const confirmedSends = storeCandidates.filter((c) => confirmedIds.has(c.candidateId)).length;
    const usableApplicantRemaining = storeCandidates.some(
      (c) => c.eligibility === "eligible" && !confirmedIds.has(c.candidateId),
    );
    return {
      storeLabel: store.storeLabel,
      districtManager: store.districtManager,
      applicantsFound: store.applicants,
      eligible: store.eligible,
      confirmedSends,
      usableApplicantRemaining,
    };
  });

  // Stores reviewed with zero usable applicants (no eligible at preview, or none remaining and none sent)
  const storesWithApplicants = new Set(
    preview.report.candidates.map((c) => c.storeLabel),
  );
  const remainingStoresWithNoUsableApplicant = preview.report.stores.filter((s) => {
    if (!storesWithApplicants.has(s.storeLabel) && s.sheetApplicantCount > 0) return true;
    const cov = storeCoverage.find((c) => c.storeLabel === s.storeLabel);
    if (!cov) return s.sheetApplicantCount > 0;
    return cov.eligible === 0 && cov.confirmedSends === 0;
  }).length;

  const final: P242FinalReport = {
    generatedAt: new Date().toISOString(),
    phase: P242_PHASE,
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
    summary: {
      openStoresReviewed: preview.report.summary.openStoresReviewed,
      applicantsFound: preview.report.summary.applicantsFound,
      uniqueApplicants: preview.report.summary.uniqueApplicants,
      eligible: preview.report.summary.eligible,
      attempted: sent.length + failed.length,
      confirmedSends: sent.length,
      failed: failed.length,
      alreadySentExclusions: preview.report.summary.alreadySent,
      signedExclusions: preview.report.summary.alreadySigned,
      remainingStoresWithNoUsableApplicant,
    },
    preview: preview.report.summary,
    assignments,
    sent,
    failed,
    storeCoverage,
    notes,
    warnings,
  };

  return {
    preview,
    final,
    finalMarkdown: formatP242FinalMarkdown(final),
  };
}
