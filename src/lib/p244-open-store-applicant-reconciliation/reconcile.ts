import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { probeDropboxSendCapacity } from "@/lib/p243-open-store-bulk-paperwork-queue/capacity";
import { classifyAndQueueP243 } from "@/lib/p243-open-store-bulk-paperwork-queue/classify";
import { resolveOpenStoreSheetCandidates } from "@/lib/p243-open-store-bulk-paperwork-queue/resolve-candidates";
import { loadOpenStoreCandidateMatches } from "@/lib/p243-open-store-bulk-paperwork-queue/resolve-xlsx";
import type { P243OsbpqQueueItem } from "@/lib/p243-open-store-bulk-paperwork-queue/types";
import {
  emptyCategoryCounts,
  mapToP244Category,
  recommendedActionForCategory,
} from "@/lib/p244-open-store-applicant-reconciliation/map-category";
import {
  recoverMissingIngestionCandidates,
  selectRecoveryTargets,
} from "@/lib/p244-open-store-applicant-reconciliation/recover";
import type {
  P244DispositionCategory,
  P244DispositionRow,
  P244FullReconciliationReport,
  P244RecoveredCandidate,
  P244ReconciliationSummary,
  P244RunOptions,
} from "@/lib/p244-open-store-applicant-reconciliation/types";
import { P244_OSAR_PHASE } from "@/lib/p244-open-store-applicant-reconciliation/types";
import { verifyAlreadySentCohort } from "@/lib/p244-open-store-applicant-reconciliation/verify-sends";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";

const P243_CONFIRMED_NAMES = new Set([
  "diana porter",
  "tracy hedderman",
  "andrew barnes",
  "elizabeth odger",
  "johnna belton",
  "thomas hafley",
  "james daniels",
]);

export type P243ConfirmedSendRef = {
  candidateId: string;
  name: string;
  email: string | null;
  signatureRequestId: string | null;
};

export function loadP243ConfirmedSends(cwd = process.cwd()): P243ConfirmedSendRef[] {
  const target = path.join(cwd, "artifacts", "p243-confirmed-sends.json");
  if (!existsSync(target)) return [];
  try {
    const raw = JSON.parse(readFileSync(target, "utf8")) as Array<{
      candidateId?: string;
      name?: string;
      email?: string | null;
      signatureRequestId?: string | null;
    }>;
    return raw.map((r) => ({
      candidateId: String(r.candidateId ?? "").trim(),
      name: String(r.name ?? "").trim(),
      email: r.email ?? null,
      signatureRequestId: r.signatureRequestId ?? null,
    }));
  } catch {
    return [];
  }
}

export function loadP243FailureIds(cwd = process.cwd()): Set<string> {
  const target = path.join(cwd, "artifacts", "p243-failures.json");
  const ids = new Set<string>();
  if (!existsSync(target)) return ids;
  try {
    const raw = JSON.parse(readFileSync(target, "utf8")) as Array<{ candidateId?: string }>;
    for (const r of raw) {
      const id = String(r.candidateId ?? "").trim();
      if (id) ids.add(id);
    }
  } catch {
    /* ignore */
  }
  return ids;
}

function isP243Confirmed(
  item: P243OsbpqQueueItem,
  confirmedById: Map<string, P243ConfirmedSendRef>,
  confirmedByName: Set<string>,
): P243ConfirmedSendRef | null {
  const byId = confirmedById.get(item.candidateId);
  if (byId) return byId;
  const nameKey = item.name.trim().toLowerCase();
  if (confirmedByName.has(nameKey) || P243_CONFIRMED_NAMES.has(nameKey)) {
    return (
      [...confirmedById.values()].find((c) => c.name.trim().toLowerCase() === nameKey) ?? {
        candidateId: item.candidateId,
        name: item.name,
        email: item.email,
        signatureRequestId: item.signatureRequestId,
      }
    );
  }
  return null;
}

function buildDispositionRow(input: {
  item: P243OsbpqQueueItem;
  p243: P243ConfirmedSendRef | null;
  category: P244DispositionCategory | "p243_confirmed_send";
  verification: Awaited<
    ReturnType<typeof verifyAlreadySentCohort>
  >["byCandidateId"] extends Map<string, infer V>
    ? V | null
    : null;
  recovery: P244RecoveredCandidate | null;
}): P244DispositionRow {
  const { item, p243, category, verification, recovery } = input;
  const sentDuringP243 = Boolean(p243);
  const previouslySent =
    sentDuringP243 ||
    Boolean(verification?.verified) ||
    item.alreadySentExclusion ||
    item.knownPriorSend ||
    Boolean(item.signatureRequestId);

  const canBeSentNow =
    !sentDuringP243 &&
    (category === "eligible_not_sent" || category === "api_capacity_deferred") &&
    !(verification?.verified);

  let reasonNotSent: string | null = null;
  if (sentDuringP243) {
    reasonNotSent = null;
  } else if (category === "eligible_not_sent") {
    reasonNotSent = "Eligible but not yet sent in P244 (queued for controlled send).";
  } else if (category === "api_capacity_deferred") {
    reasonNotSent = "eligible_deferred_api_capacity";
  } else {
    reasonNotSent =
      item.blockDetail ||
      item.blockReasons.join(", ") ||
      category;
  }

  return {
    sheetRowIndex: item.sheetRowIndex,
    candidateName: item.name,
    candidateEmail: item.email,
    breezyCandidateId: item.candidateId.startsWith("sheet-row-") ? null : item.candidateId,
    position: item.positionName ?? "",
    matchingOpenStore: item.storeLabel,
    storeNumber: item.storeNumber,
    project: item.project,
    breezyStage: item.breezyStage,
    workflowStage: item.workflowStage,
    paperworkStatus: item.paperworkStatus,
    signatureRequestId:
      verification?.signatureRequestId ??
      p243?.signatureRequestId ??
      item.signatureRequestId,
    previouslySent,
    sentDuringP243,
    eligibilityResult: sentDuringP243
      ? "p243_confirmed"
      : item.eligibility === "eligible" || category === "eligible_not_sent"
        ? "eligible"
        : "blocked",
    reasonNotSent,
    canBeSentNow,
    recommendedNextAction: recommendedActionForCategory(category, canBeSentNow),
    category,
    rowKind: sentDuringP243 ? "p243_confirmed_send" : "remaining",
    matchMethod: item.matchMethod,
    milesToStore: item.milesToStore,
    distanceTier: item.distanceTier,
    assignedRecruiter: item.assignedRecruiter,
    assignedDM: item.assignedDM,
    sendVerification: verification,
    recoveryAttempted: Boolean(recovery),
    recoverySucceeded: Boolean(recovery?.foundInBreezy),
    recoveryDetail: recovery?.detail ?? null,
    blockReasons: item.blockReasons,
    blockDetail: item.blockDetail,
    idempotencyKey: item.idempotencyKey,
  };
}

function summarize(
  dispositions: P244DispositionRow[],
  recovered: P244RecoveredCandidate[],
  newConfirmedCount: number,
  attempted: number,
  safeCapacity: number | null,
): P244ReconciliationSummary {
  const remaining = dispositions.filter((d) => d.rowKind === "remaining");
  const categoryCounts = emptyCategoryCounts();
  for (const d of remaining) {
    if (d.category === "p243_confirmed_send") continue;
    categoryCounts[d.category as P244DispositionCategory] += 1;
  }

  const stillManual = remaining.filter(
    (d) =>
      !d.canBeSentNow &&
      d.category !== "already_sent" &&
      d.category !== "already_signed" &&
      d.category !== "ready_for_mel" &&
      d.category !== "active_in_mel" &&
      d.category !== "api_capacity_deferred" &&
      d.category !== "eligible_not_sent",
  ).length;

  return {
    totalSpreadsheetApplicants: dispositions.length,
    p243ConfirmedSends: dispositions.filter((d) => d.rowKind === "p243_confirmed_send").length,
    remainingApplicantsReviewed: remaining.length,
    previouslySentAndVerified: categoryCounts.already_sent,
    alreadySigned: categoryCounts.already_signed,
    readyForMelOrActiveInMel: categoryCounts.ready_for_mel + categoryCounts.active_in_mel,
    duplicates: categoryCounts.duplicate_candidate,
    invalidEmails: categoryCounts.invalid_or_missing_email,
    missingIngestionCandidates: categoryCounts.missing_durable_ingestion + categoryCounts.candidate_not_found,
    recoveredCandidates: recovered.filter((r) => r.foundInBreezy).length,
    otherBlockedCandidates:
      categoryCounts.other_blocked +
      categoryCounts.ambiguous_candidate_match +
      categoryCounts.inactive_or_archived_position +
      categoryCounts.location_or_store_mismatch +
      categoryCounts.over_60_miles +
      categoryCounts.missing_recruiter +
      categoryCounts.missing_district_manager,
    eligibleApplicantsFound: categoryCounts.eligible_not_sent + categoryCounts.api_capacity_deferred,
    additionalSendsAttempted: attempted,
    additionalSendsConfirmed: newConfirmedCount,
    deferredDueToApiCapacity: categoryCounts.api_capacity_deferred,
    stillRequiringManualAction: stillManual,
    remainingDropboxSafeCapacity: safeCapacity,
    categoryCounts,
  };
}

/**
 * Full Step 1–5 reconciliation (disposition + verify + recover + eligible freeze).
 * Does not send — caller/execute handles Step 6.
 */
export async function reconcileOpenStoreApplicants(
  options: Pick<P244RunOptions, "xlsxPath" | "approveOver60Ids" | "verifyDropbox"> & {
    persistRecovery?: boolean;
  },
): Promise<{
  reportBase: Omit<
    P244FullReconciliationReport,
    | "mode"
    | "dryRun"
    | "liveWritesOccurred"
    | "newConfirmedSends"
    | "stoppedOnSystemFailure"
    | "systemStopReason"
  > & {
    eligibleQueueItems: P243OsbpqQueueItem[];
    allQueueItems: P243OsbpqQueueItem[];
  };
  notes: string[];
  warnings: string[];
}> {
  const notes: string[] = [];
  const warnings: string[] = [];

  const p243Confirmed = loadP243ConfirmedSends();
  const confirmedById = new Map(p243Confirmed.map((c) => [c.candidateId, c]));
  const confirmedByName = new Set(p243Confirmed.map((c) => c.name.trim().toLowerCase()));
  const failureIds = loadP243FailureIds();
  notes.push(`Loaded ${p243Confirmed.length} P243 confirmed send(s); ${failureIds.size} failure id(s).`);

  const loaded = loadOpenStoreCandidateMatches(options.xlsxPath);
  notes.push(...loaded.notes);
  if (loaded.rows.length !== 81) {
    warnings.push(`Expected 81 spreadsheet rows, found ${loaded.rows.length}.`);
  }

  const capacity = await probeDropboxSendCapacity();
  notes.push(capacity.detail);
  warnings.push(...capacity.limitationNotes);

  let dropboxTestMode: boolean | null = null;
  try {
    dropboxTestMode = readDropboxSignConfig()?.testMode ?? null;
  } catch {
    dropboxTestMode = null;
  }

  // First pass resolve + classify
  let resolved = await resolveOpenStoreSheetCandidates({ rows: loaded.rows });
  notes.push(...resolved.notes);
  warnings.push(...resolved.warnings);

  let queued = await classifyAndQueueP243({
    resolved: resolved.resolved,
    approveOver60Ids: options.approveOver60Ids,
    safeCapacity: capacity.safeCapacity,
  });
  notes.push(...queued.notes);

  // Recovery for unresolved / Melissa / missing ingestion
  const queueByRow = new Map(
    queued.items.map((i) => [
      i.sheetRowIndex,
      {
        candidateId: i.candidateId,
        blockReasons: i.blockReasons as string[],
        blockDetail: i.blockDetail,
        eligibility: i.eligibility,
      },
    ]),
  );
  const recoveryTargets = selectRecoveryTargets({
    sheets: loaded.rows,
    queueByRowIndex: queueByRow,
    knownFailureIds: failureIds,
  });
  const recovery = await recoverMissingIngestionCandidates({
    sheets: loaded.rows,
    unresolvedOrMissing: recoveryTargets,
    persist: options.persistRecovery === true,
  });
  notes.push(...recovery.notes);

  // Re-resolve/classify after recovery so eligibility is current
  if (recovery.recovered.some((r) => r.foundInBreezy) && options.persistRecovery) {
    resolved = await resolveOpenStoreSheetCandidates({ rows: loaded.rows });
    notes.push(...resolved.notes.map((n) => `[post-recovery] ${n}`));
    queued = await classifyAndQueueP243({
      resolved: resolved.resolved,
      approveOver60Ids: options.approveOver60Ids,
      safeCapacity: capacity.safeCapacity,
    });
    notes.push(...queued.notes.map((n) => `[post-recovery] ${n}`));
  }

  // Verify already_sent (and known prior) with Dropbox evidence
  const alreadySentItems = queued.items.filter(
    (i) =>
      i.blockReasons.includes("already_sent") ||
      i.blockReasons.includes("already_signed") ||
      i.knownPriorSend ||
      Boolean(i.signatureRequestId),
  );
  const verification = await verifyAlreadySentCohort({
    items: alreadySentItems,
    verifyDropbox: options.verifyDropbox !== false,
  });
  notes.push(...verification.notes);

  const recoveryByRow = new Map(recovery.recovered.map((r) => [r.sheetRowIndex, r]));

  // Prefer one queue item per sheet row (items already 1:1 with sheet)
  const dispositions: P244DispositionRow[] = [];
  const claimedP243Ids = new Set<string>();

  for (const item of queued.items) {
    const p243Hit = isP243Confirmed(item, confirmedById, confirmedByName);
    if (p243Hit && !claimedP243Ids.has(p243Hit.candidateId || item.candidateId)) {
      claimedP243Ids.add(p243Hit.candidateId || item.candidateId);
      dispositions.push(
        buildDispositionRow({
          item,
          p243: p243Hit,
          category: "p243_confirmed_send",
          verification: verification.byCandidateId.get(item.candidateId) ?? null,
          recovery: recoveryByRow.get(item.sheetRowIndex) ?? null,
        }),
      );
      continue;
    }
    if (p243Hit) {
      // Duplicate sheet row of a P243 confirmed identity — still remaining? Treat as duplicate.
      // Keep as remaining duplicate so totals stay 81 with exactly 7 p243 sends.
    }

    let category = mapToP244Category({
      item,
      missingDurableIngestion: failureIds.has(item.candidateId),
    });

    // Unresolved after recovery attempt → candidate_not_found (not missing ingestion)
    if (
      item.blockReasons.includes("unresolved") &&
      !failureIds.has(item.candidateId) &&
      !(recoveryByRow.get(item.sheetRowIndex)?.foundInBreezy)
    ) {
      category = "candidate_not_found";
    }

    const ver = verification.byCandidateId.get(item.candidateId) ?? null;
    if (category === "already_sent" && ver && !ver.verified && ver.reclassifiedTo) {
      category = ver.reclassifiedTo;
      notes.push(
        `Reclassified ${item.name} from already_sent → ${ver.reclassifiedTo}: ${ver.detail}`,
      );
    }

    // If recovery found them and they're now eligible, prefer eligible_not_sent
    const rec = recoveryByRow.get(item.sheetRowIndex);
    if (rec?.foundInBreezy && item.eligibility === "eligible") {
      category = "eligible_not_sent";
      rec.eligibilityAfter = "eligible";
      rec.categoryAfter = category;
    } else if (rec?.foundInBreezy && failureIds.has(item.candidateId) && item.eligibility !== "eligible") {
      // Known P243 failure still blocked after restore
      category = "missing_durable_ingestion";
      rec.eligibilityAfter = "blocked";
      rec.categoryAfter = category;
    } else if (rec) {
      rec.eligibilityAfter = item.eligibility === "eligible" ? "eligible" : "blocked";
      rec.categoryAfter = category;
    }

    dispositions.push(
      buildDispositionRow({
        item,
        p243: null,
        category,
        verification: ver,
        recovery: rec ?? null,
      }),
    );
  }

  // Ensure exactly 7 P243 confirmed — if name-matched fewer, pad from confirmed list against sheet
  let p243Count = dispositions.filter((d) => d.rowKind === "p243_confirmed_send").length;
  if (p243Count < 7) {
    for (const conf of p243Confirmed) {
      if (p243Count >= 7) break;
      if (claimedP243Ids.has(conf.candidateId)) continue;
      const idx = dispositions.findIndex(
        (d) =>
          d.rowKind === "remaining" &&
          (d.breezyCandidateId === conf.candidateId ||
            d.candidateName.trim().toLowerCase() === conf.name.trim().toLowerCase()),
      );
      if (idx < 0) continue;
      const row = dispositions[idx]!;
      dispositions[idx] = {
        ...row,
        sentDuringP243: true,
        previouslySent: true,
        eligibilityResult: "p243_confirmed",
        reasonNotSent: null,
        canBeSentNow: false,
        category: "p243_confirmed_send",
        rowKind: "p243_confirmed_send",
        signatureRequestId: conf.signatureRequestId ?? row.signatureRequestId,
        recommendedNextAction: recommendedActionForCategory("p243_confirmed_send", false),
      };
      claimedP243Ids.add(conf.candidateId);
      p243Count += 1;
    }
  }

  const remaining74 = dispositions.filter((d) => d.rowKind === "remaining");
  if (dispositions.length !== 81 || remaining74.length !== 74 || p243Count !== 7) {
    warnings.push(
      `Total reconciliation check: dispositions=${dispositions.length} p243=${p243Count} remaining=${remaining74.length} (expected 81/7/74).`,
    );
  } else {
    notes.push("Totals reconcile: 81 = 7 P243 sends + 74 remaining.");
  }

  // Apply capacity deferral stamp onto eligible beyond safe capacity
  const eligibleRows = remaining74.filter((d) => d.category === "eligible_not_sent");
  const safeCap = capacity.safeCapacity;
  if (safeCap != null && eligibleRows.length > safeCap) {
    const deferredSlice = eligibleRows.slice(safeCap);
    for (const d of deferredSlice) {
      d.category = "api_capacity_deferred";
      d.reasonNotSent = "eligible_deferred_api_capacity";
      d.canBeSentNow = false;
      d.recommendedNextAction = recommendedActionForCategory("api_capacity_deferred", false);
    }
    notes.push(
      `Stamped ${deferredSlice.length} eligible as api_capacity_deferred (safeCapacity=${safeCap}).`,
    );
  }

  const alreadySentVerified = remaining74.filter(
    (d) => d.category === "already_sent" && (d.sendVerification?.verified ?? d.previouslySent),
  );
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

  const summary = summarize(dispositions, recovery.recovered, 0, 0, capacity.safeCapacity);

  // Eligible queue items for send (frozen cohort = eligible_not_sent only, not deferred)
  const eligibleIdSet = new Set(
    remaining74
      .filter((d) => d.category === "eligible_not_sent" && d.breezyCandidateId)
      .map((d) => d.breezyCandidateId!),
  );
  const eligibleQueueItems = queued.items.filter(
    (i) => eligibleIdSet.has(i.candidateId) && i.eligibility === "eligible",
  );

  return {
    reportBase: {
      generatedAt: new Date().toISOString(),
      phase: P244_OSAR_PHASE,
      xlsxPath: options.xlsxPath,
      dropboxTestMode,
      capacity,
      summary,
      dispositions,
      remaining74,
      alreadySentVerified,
      recovered: recovery.recovered,
      eligibleRemaining,
      apiDeferred,
      stillBlocked,
      notes,
      warnings: [...new Set(warnings)],
      eligibleQueueItems,
      allQueueItems: queued.items,
    },
    notes,
    warnings,
  };
}
