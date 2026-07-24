import type { BreezyCandidate } from "@/lib/breezy-api";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import {
  findCandidateInStore,
  runCandidateLookupRescue,
} from "@/lib/candidate-ingestion/fresh-candidate-ingestion-rescue";
import {
  listIngestedCandidates,
  mergeIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { backfillWorkflowRecordsForCandidates } from "@/lib/candidate-ingestion/backfill-workflow-records";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { normalizeEmailFingerprint } from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import {
  displayName,
  normalizePhone,
} from "@/lib/p243-open-store-bulk-paperwork-queue/resolve-candidates";
import type { P243OsbpqSheetRow } from "@/lib/p243-open-store-bulk-paperwork-queue/types";
import { normalizePositionKey, normalizeText } from "@/lib/open-stores-paperwork-send/normalize";
import type { P244RecoveredCandidate } from "@/lib/p244-open-store-applicant-reconciliation/types";

function namesEqual(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

async function targetedPositionLookup(
  sheet: P243OsbpqSheetRow,
): Promise<BreezyCandidate | null> {
  const jobs = await fetchBreezyJobs("published");
  if (!jobs.ok) return null;
  const wantPos = normalizePositionKey(sheet.position);
  const emailFp = normalizeEmailFingerprint(sheet.email);
  const phone = normalizePhone(sheet.phone);
  const nameKey = normalizeText(sheet.candidateName);

  const matches = jobs.jobs.filter((j) => normalizePositionKey(j.name) === wantPos);
  const pool = matches.length > 0 ? matches : jobs.jobs.slice(0, 15);

  for (const job of pool.slice(0, 12)) {
    const live = await fetchBreezyCandidates({
      positionId: job.jobId,
      force: true,
      maxPages: 3,
      scanMode: "all",
    });
    if (!live.ok) continue;
    for (const c of live.candidates) {
      const cEmail = normalizeEmailFingerprint(c.email);
      if (emailFp && cEmail === emailFp) return { ...c, positionId: c.positionId || job.jobId };
      if (phone && normalizePhone(c.phone) === phone && namesEqual(displayName(c), sheet.candidateName)) {
        return { ...c, positionId: c.positionId || job.jobId };
      }
      if (
        nameKey &&
        normalizeText(displayName(c)) === nameKey &&
        normalizePositionKey(c.positionName ?? "") === wantPos
      ) {
        return { ...c, positionId: c.positionId || job.jobId };
      }
    }
  }
  return null;
}

/**
 * Recover Melissa Lloyd + any other missing durable ingestion / unresolved rows.
 * Restores workflow without duplicating packets; merges into ingestion store.
 */
export async function recoverMissingIngestionCandidates(input: {
  sheets: P243OsbpqSheetRow[];
  unresolvedOrMissing: Array<{
    sheet: P243OsbpqSheetRow;
    candidateIdHint: string | null;
    reason: string;
  }>;
  persist: boolean;
}): Promise<{ recovered: P244RecoveredCandidate[]; notes: string[] }> {
  const notes: string[] = [];
  const recovered: P244RecoveredCandidate[] = [];
  if (input.unresolvedOrMissing.length === 0) {
    notes.push("No missing-ingestion / unresolved candidates to recover.");
    return { recovered, notes };
  }

  let store = await readIngestionStore();
  const workflows = await getCandidateWorkflowState();
  const toBackfill: BreezyCandidate[] = [];

  for (const target of input.unresolvedOrMissing) {
    const sheet = target.sheet;
    let method: P244RecoveredCandidate["recoveryMethod"] = "none";
    let candidate: BreezyCandidate | null = null;
    let detail = target.reason;

    // 1) Breezy ID hint
    if (target.candidateIdHint && /^[a-f0-9]{8,}$/i.test(target.candidateIdHint)) {
      const byId = store.candidates[target.candidateIdHint];
      if (byId) {
        candidate = byId;
        method = "breezy_id";
        detail = `Found in ingestion by id=${target.candidateIdHint}`;
      }
    }

    // 2) Normalized email via store + rescue
    if (!candidate && sheet.email) {
      const inStore = findCandidateInStore(store, { email: sheet.email });
      if (inStore) {
        candidate = inStore;
        method = "normalized_email";
        detail = `Found in ingestion by email`;
      } else {
        const rescue = await runCandidateLookupRescue(
          { email: sheet.email, name: sheet.candidateName },
          { force: true },
        );
        store = rescue.store;
        if (rescue.result.found && rescue.result.candidateId) {
          candidate = store.candidates[rescue.result.candidateId] ?? null;
          method = "breezy_api_lookup";
          detail = `Lookup rescue source=${rescue.result.source}`;
        }
      }
    }

    // 3) Phone + name
    if (!candidate && sheet.phone) {
      const phone = normalizePhone(sheet.phone);
      const hit = listIngestedCandidates(store).find(
        (c) =>
          normalizePhone(c.phone) === phone &&
          namesEqual(displayName(c), sheet.candidateName),
      );
      if (hit) {
        candidate = hit;
        method = "phone";
        detail = "Found in ingestion by phone+name";
      }
    }

    // 4) Name + position in store
    if (!candidate) {
      const wantPos = normalizePositionKey(sheet.position);
      const hit = listIngestedCandidates(store).find(
        (c) =>
          namesEqual(displayName(c), sheet.candidateName) &&
          normalizePositionKey(c.positionName ?? "") === wantPos,
      );
      if (hit) {
        candidate = hit;
        method = "name_position";
        detail = "Found in ingestion by name+position";
      }
    }

    // 5) Direct Breezy API position-targeted lookup
    if (!candidate) {
      const live = await targetedPositionLookup(sheet);
      if (live) {
        candidate = live;
        method = "breezy_api_lookup";
        detail = `Breezy live position lookup matched ${live.candidateId}`;
        if (input.persist) {
          const merged = mergeIngestedCandidates(store, [live]);
          store = merged.store;
        }
      }
    }

    let workflowCreatedOrRestored = false;
    if (candidate) {
      toBackfill.push(candidate);
      const existingWf = workflows[candidate.candidateId];
      if (!existingWf) {
        method = method === "none" ? "workflow_restore" : method;
        detail = `${detail}; workflow missing — will backfill`;
      } else {
        detail = `${detail}; workflow present stage=${existingWf.workflowStatus}`;
      }
    }

    recovered.push({
      sheetRowIndex: sheet.rowIndex,
      name: sheet.candidateName,
      email: sheet.email,
      phone: sheet.phone,
      breezyCandidateId: candidate?.candidateId ?? null,
      recoveryMethod: method,
      foundInBreezy: Boolean(candidate),
      workflowCreatedOrRestored: false, // filled after backfill
      eligibilityAfter: "unknown",
      categoryAfter: null,
      detail,
    });
  }

  if (input.persist && toBackfill.length > 0) {
    await writeIngestionStore(store);
    const wfState = await getCandidateWorkflowState();
    const backfill = await backfillWorkflowRecordsForCandidates({
      candidates: toBackfill,
      workflows: wfState,
      byUserId: "Taylor Custenborder",
    });
    notes.push(
      `Backfilled/reconciled workflows: created=${backfill.created} reconciled=${backfill.reconciled}`,
    );
    const createdIds = new Set(backfill.records.map((r) => r.candidateId));
    for (const row of recovered) {
      if (row.breezyCandidateId && createdIds.has(row.breezyCandidateId)) {
        row.workflowCreatedOrRestored = true;
        if (row.recoveryMethod === "none") row.recoveryMethod = "workflow_restore";
      } else if (row.breezyCandidateId && wfState[row.breezyCandidateId]) {
        // already had workflow; still mark restore attempt success if found
        row.workflowCreatedOrRestored = true;
      }
    }
  } else if (!input.persist) {
    notes.push("Recovery dry-run — ingestion/workflow not persisted.");
  }

  const found = recovered.filter((r) => r.foundInBreezy).length;
  notes.push(
    `Recovery attempted for ${recovered.length}; found in Breezy=${found}; missed=${recovered.length - found}.`,
  );
  return { recovered, notes };
}

/** Convenience: identify recovery targets from sheet + queue items. */
export function selectRecoveryTargets(input: {
  sheets: P243OsbpqSheetRow[];
  queueByRowIndex: Map<number, { candidateId: string; blockReasons: string[]; blockDetail: string | null; eligibility: string }>;
  knownFailureIds: Set<string>;
}): Array<{ sheet: P243OsbpqSheetRow; candidateIdHint: string | null; reason: string }> {
  const out: Array<{ sheet: P243OsbpqSheetRow; candidateIdHint: string | null; reason: string }> = [];
  for (const sheet of input.sheets) {
    const q = input.queueByRowIndex.get(sheet.rowIndex);
    const reasons = new Set(q?.blockReasons ?? []);
    const detail = String(q?.blockDetail ?? "");
    const isUnresolved = reasons.has("unresolved") || reasons.has("ambiguous_match");
    const isMissingIngestion =
      input.knownFailureIds.has(q?.candidateId ?? "") ||
      /missing_durable|missing ingestion|unconfirmed outcome/i.test(detail) ||
      (q?.eligibility === "eligible" && input.knownFailureIds.has(q.candidateId));

    // Melissa Lloyd and peers: eligible attempted but failed without signature
    const nameHint = normalizeText(sheet.candidateName);
    const isMelissa = nameHint.includes("melissa") && nameHint.includes("lloyd");

    if (isUnresolved || isMissingIngestion || isMelissa) {
      out.push({
        sheet,
        candidateIdHint: q?.candidateId?.startsWith("sheet-row-") ? null : (q?.candidateId ?? null),
        reason: isMelissa
          ? "P243 failed send — missing durable confirmation"
          : isUnresolved
            ? "unresolved/ambiguous sheet match"
            : "missing_durable_ingestion signal",
      });
    }
  }
  return out;
}
