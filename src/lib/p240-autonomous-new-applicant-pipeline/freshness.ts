/**
 * P240 / P242+ — fresh-new replay reset, state-hash validation, and Breezy
 * read-only hydration for dry-run / simulation paths.
 *
 * In-memory only. Never writes durable workflow or ingestion stores.
 */

import { createHash } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  enrichBreezyCandidateWithQuestionnairePayload,
  fetchBreezyCandidateEnrichmentPayload,
  resolveBreezyCompany,
} from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

/**
 * Fields cleared when replaying an already-advanced candidate as a fresh Applied
 * arrival. Stage/packet resets were present in P240; P242 adds action + progression
 * clears so stale `await-signature` / `send-paperwork` cannot false-fail P65.6.
 *
 * Does NOT weaken live P65.6: callers still pass the real workflow when
 * `replayAsFreshNew` is false (active_packet / already-sent protection intact).
 */
export const P240_FRESH_NEW_REPLAY_ACTION_FIELDS = [
  "actionType",
  "requiredAction",
  "actionReason",
  "actionDueDate",
  "actionGeneratedAt",
  "actionPriority",
  "actionConfidence",
  "nextActionNeeded",
  "lastActionAt",
  "recommendedStage",
  "progressionReason",
  "progressionConfidence",
  "progressionPriority",
  "progressionGeneratedAt",
] as const;

/** Assignment fields cleared for a true fresh-new arrival (P158/P216 re-resolve). */
export const P240_FRESH_NEW_REPLAY_ASSIGNMENT_FIELDS = [
  "assignedRecruiter",
  "assignedDM",
  "recruiterAssignmentSource",
  "recruiterAssignmentReason",
  "recruiterAssignmentConfidence",
  "recruiterAssignedAt",
  "recruiterOwnershipVersion",
] as const;

/** Packet / paperwork fields that must not survive a fresh-new replay. */
export const P240_FRESH_NEW_REPLAY_PACKET_FIELDS = [
  "paperworkStatus",
  "signatureRequestId",
  "paperworkSentAt",
  "paperworkSignedAt",
  "paperworkViewedAt",
  "paperworkError",
  "paperworkViewCount",
  "paperworkTemplateKey",
  "onboardingContactEmail",
] as const;

const DUPLICATE_NOTE_RE =
  /\b(duplicate|dup\b|identity\s*conflict|merged\s*from|dedup(ed|licate)?)\b/i;
const COVERAGE_NOTE_RE =
  /\b(coverage|distance|nearest\s*miles?|proximity|geocode\s*cache|tier[123]|out[_\s-]?of[_\s-]?range)\b/i;

export type P240FreshnessStateSnapshot = {
  workflowStatus: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  assignedRecruiter: string;
  assignedDM: string;
  actionType: string | null;
  requiredAction: string | null;
  lastActionAt: string | null;
  nextActionNeeded: string;
  recruiterAssignmentSource: string | null;
  duplicateNoteCount: number;
  coverageNoteCount: number;
  historyLen: number;
};

export type P240FreshnessValidation = {
  preResetHash: string;
  postResetHash: string;
  /** True when post-reset state still contains fields that should be cleared. */
  hashMismatch: boolean;
  leftoverStaleFields: string[];
  notes: string[];
  preSnapshot: P240FreshnessStateSnapshot;
  postSnapshot: P240FreshnessStateSnapshot;
};

export type RefreshBreezyCandidateResult = {
  ok: boolean;
  candidateId: string;
  candidate: BreezyCandidate | null;
  source: "breezy_enrichment" | "ingestion_cache" | "none";
  durableWrite: false;
  note: string;
  error: string | null;
};

function isDuplicateOrCoverageNote(note: string): boolean {
  return DUPLICATE_NOTE_RE.test(note) || COVERAGE_NOTE_RE.test(note);
}

function stripStaleNotes(notes: string[] | undefined): string[] {
  if (!notes?.length) return [];
  return notes.filter((n) => !isDuplicateOrCoverageNote(String(n)));
}

export function snapshotP240FreshnessState(
  workflow: CandidateWorkflowRecord,
): P240FreshnessStateSnapshot {
  const notes = workflow.notes ?? [];
  return {
    workflowStatus: String(workflow.workflowStatus ?? ""),
    paperworkStatus: String(workflow.paperworkStatus ?? "not_sent"),
    signatureRequestId: workflow.signatureRequestId
      ? String(workflow.signatureRequestId).trim() || null
      : null,
    assignedRecruiter: String(workflow.assignedRecruiter ?? "Unassigned"),
    assignedDM: String(workflow.assignedDM ?? "Unassigned"),
    actionType: workflow.actionType ?? null,
    requiredAction: workflow.requiredAction ?? null,
    lastActionAt: workflow.lastActionAt ?? null,
    nextActionNeeded: String(workflow.nextActionNeeded ?? ""),
    recruiterAssignmentSource: workflow.recruiterAssignmentSource ?? null,
    duplicateNoteCount: notes.filter((n) => DUPLICATE_NOTE_RE.test(String(n))).length,
    coverageNoteCount: notes.filter((n) => COVERAGE_NOTE_RE.test(String(n))).length,
    historyLen: Array.isArray(workflow.history) ? workflow.history.length : 0,
  };
}

export function hashP240FreshnessState(workflow: CandidateWorkflowRecord): string {
  const snap = snapshotP240FreshnessState(workflow);
  return createHash("sha256").update(JSON.stringify(snap)).digest("hex").slice(0, 16);
}

/**
 * Ideal post-reset fingerprint — used to detect leftover stale fields after reset.
 */
export function expectedFreshNewStateHash(candidateId: string): string {
  return hashP240FreshnessState({
    candidateId,
    workflowStatus: "Applied",
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: new Date(0).toISOString(),
    actionType: null,
    requiredAction: null,
    actionReason: null,
    actionDueDate: null,
    actionGeneratedAt: null,
    actionPriority: null,
    actionConfidence: null,
    recommendedStage: null,
    progressionReason: null,
    progressionConfidence: null,
    progressionPriority: null,
    progressionGeneratedAt: null,
    recruiterAssignmentSource: null,
    recruiterAssignmentReason: null,
    recruiterAssignmentConfidence: null,
    recruiterAssignedAt: null,
    recruiterOwnershipVersion: undefined,
  });
}

export function findLeftoverStaleFreshNewFields(
  workflow: CandidateWorkflowRecord,
): string[] {
  const leftover: string[] = [];
  if (workflow.workflowStatus !== "Applied") leftover.push("workflowStatus");
  if (workflow.paperworkStatus !== "not_sent") leftover.push("paperworkStatus");
  if (String(workflow.signatureRequestId ?? "").trim()) leftover.push("signatureRequestId");
  if (workflow.paperworkSentAt) leftover.push("paperworkSentAt");
  if (workflow.paperworkSignedAt) leftover.push("paperworkSignedAt");
  if (workflow.paperworkViewedAt) leftover.push("paperworkViewedAt");
  if (workflow.paperworkError) leftover.push("paperworkError");
  if ((workflow.paperworkViewCount ?? 0) > 0) leftover.push("paperworkViewCount");
  if (workflow.paperworkTemplateKey) leftover.push("paperworkTemplateKey");
  if (workflow.onboardingContactEmail) leftover.push("onboardingContactEmail");

  const recruiter = String(workflow.assignedRecruiter ?? "Unassigned").trim();
  if (recruiter && recruiter.toLowerCase() !== "unassigned") {
    leftover.push("assignedRecruiter");
  }
  const dm = String(workflow.assignedDM ?? "Unassigned").trim();
  if (dm && dm.toLowerCase() !== "unassigned") leftover.push("assignedDM");
  if (workflow.recruiterAssignmentSource) leftover.push("recruiterAssignmentSource");
  if (workflow.recruiterAssignmentReason) leftover.push("recruiterAssignmentReason");
  if (workflow.recruiterAssignmentConfidence != null) {
    leftover.push("recruiterAssignmentConfidence");
  }
  if (workflow.recruiterAssignedAt) leftover.push("recruiterAssignedAt");

  for (const field of P240_FRESH_NEW_REPLAY_ACTION_FIELDS) {
    if (field === "nextActionNeeded") {
      if (String(workflow.nextActionNeeded ?? "") !== "Review") leftover.push(field);
      continue;
    }
    const value = (workflow as Record<string, unknown>)[field];
    if (value != null && value !== "") leftover.push(field);
  }

  const notes = workflow.notes ?? [];
  if (notes.some((n) => DUPLICATE_NOTE_RE.test(String(n)))) leftover.push("duplicateNotes");
  if (notes.some((n) => COVERAGE_NOTE_RE.test(String(n)))) leftover.push("coverageNotes");

  return leftover;
}

/**
 * Comprehensive in-memory reset to a genuine new Applied arrival.
 * Preserves `candidateId` (original Breezy id). Clears action/packet/assignment
 * state, duplicate/coverage note markers, and assignment history. Never writes.
 */
export function resetToFreshNewState(
  workflow: CandidateWorkflowRecord,
): CandidateWorkflowRecord {
  const candidateId = workflow.candidateId;
  return {
    ...workflow,
    candidateId,
    workflowStatus: "Applied",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkSentAt: null,
    paperworkSignedAt: null,
    paperworkViewedAt: null,
    paperworkError: null,
    paperworkViewCount: 0,
    paperworkTemplateKey: null,
    onboardingContactEmail: null,
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    recruiterAssignmentSource: null,
    recruiterAssignmentReason: null,
    recruiterAssignmentConfidence: null,
    recruiterAssignedAt: null,
    recruiterOwnershipVersion: undefined,
    actionType: null,
    requiredAction: null,
    actionReason: null,
    actionDueDate: null,
    actionGeneratedAt: null,
    actionPriority: null,
    actionConfidence: null,
    nextActionNeeded: "Review",
    lastActionAt: null,
    recommendedStage: null,
    progressionReason: null,
    progressionConfidence: null,
    progressionPriority: null,
    progressionGeneratedAt: null,
    followUpDueAt: null,
    snoozedUntil: null,
    recruitingActions: emptyRecruitingActions(),
    // Drop duplicate / coverage cache markers; keep other operator notes.
    notes: stripStaleNotes(workflow.notes),
    // Fresh arrival has no prior assignment/paperwork history in the overlay.
    history: [],
  };
}

/**
 * @deprecated Prefer {@link resetToFreshNewState}. Kept as a backward-compatible
 * alias — same comprehensive reset (P242+).
 */
export function applyP240FreshNewReplayReset(
  workflow: CandidateWorkflowRecord,
): CandidateWorkflowRecord {
  return resetToFreshNewState(workflow);
}

export function validateP240FreshNewReset(input: {
  before: CandidateWorkflowRecord;
  after: CandidateWorkflowRecord;
}): P240FreshnessValidation {
  const preSnapshot = snapshotP240FreshnessState(input.before);
  const postSnapshot = snapshotP240FreshnessState(input.after);
  const preResetHash = hashP240FreshnessState(input.before);
  const postResetHash = hashP240FreshnessState(input.after);
  const leftoverStaleFields = findLeftoverStaleFreshNewFields(input.after);
  const expected = expectedFreshNewStateHash(input.after.candidateId);
  const hashMismatch = leftoverStaleFields.length > 0 || postResetHash !== expected;

  const notes: string[] = [];
  if (input.after.candidateId !== input.before.candidateId) {
    notes.push("CRITICAL: candidateId changed during reset — original Breezy id must be preserved");
  } else {
    notes.push(`Preserved Breezy candidateId=${input.after.candidateId}`);
  }
  if (hashMismatch) {
    notes.push(
      `Fresh-new reset incomplete: leftover=[${leftoverStaleFields.join(", ") || "hash drift"}]`,
    );
  } else {
    notes.push("Fresh-new reset validated — no leftover stale fields");
  }

  return {
    preResetHash,
    postResetHash,
    hashMismatch,
    leftoverStaleFields,
    notes,
    preSnapshot,
    postSnapshot,
  };
}

/**
 * Read-only refresh of a candidate from Breezy detail APIs (resume + questionnaire),
 * falling back to the durable ingestion cache. Never writes durable stores.
 */
export async function refreshBreezyCandidateData(
  candidateId: string,
  options?: {
    /** Optional seed when ingestion cache / caller already has a partial row. */
    seed?: BreezyCandidate | null;
    /** Prefer network enrichment. Default true. */
    allowNetwork?: boolean;
  },
): Promise<RefreshBreezyCandidateResult> {
  const id = String(candidateId ?? "").trim();
  if (!id) {
    return {
      ok: false,
      candidateId: "",
      candidate: null,
      source: "none",
      durableWrite: false,
      note: "candidateId required",
      error: "missing_candidate_id",
    };
  }

  const store = await readIngestionStore();
  const cached = store.candidates[id] ?? options?.seed ?? null;
  const allowNetwork = options?.allowNetwork !== false;

  if (!allowNetwork) {
    if (cached) {
      return {
        ok: true,
        candidateId: id,
        candidate: { ...cached },
        source: "ingestion_cache",
        durableWrite: false,
        note: "Returned ingestion-cache copy (network disabled)",
        error: null,
      };
    }
    return {
      ok: false,
      candidateId: id,
      candidate: null,
      source: "none",
      durableWrite: false,
      note: "No ingestion cache and network disabled",
      error: "not_found",
    };
  }

  const seed = cached ?? options?.seed ?? null;
  const positionId = String(seed?.positionId ?? "").trim();
  if (!seed || !positionId) {
    if (seed) {
      return {
        ok: true,
        candidateId: id,
        candidate: { ...seed },
        source: "ingestion_cache",
        durableWrite: false,
        note: "Missing positionId — cannot call Breezy detail APIs; using cache/seed",
        error: null,
      };
    }
    return {
      ok: false,
      candidateId: id,
      candidate: null,
      source: "none",
      durableWrite: false,
      note: "Candidate not in ingestion cache and no seed provided",
      error: "not_found",
    };
  }

  try {
    const company = await resolveBreezyCompany();
    if (!company.ok) {
      return {
        ok: true,
        candidateId: id,
        candidate: { ...seed },
        source: "ingestion_cache",
        durableWrite: false,
        note: `Breezy company resolve failed (${company.error}); using ingestion cache`,
        error: company.error,
      };
    }

    const payload = await fetchBreezyCandidateEnrichmentPayload({
      companyId: company.companyId,
      positionId,
      candidateId: id,
    });

    if (!payload.ok) {
      return {
        ok: true,
        candidateId: id,
        candidate: { ...seed },
        source: "ingestion_cache",
        durableWrite: false,
        note: `Breezy enrichment failed (${payload.error}); using ingestion cache`,
        error: payload.error,
      };
    }

    const enriched = enrichBreezyCandidateWithQuestionnairePayload(seed, payload.payload);
    return {
      ok: true,
      candidateId: id,
      candidate: enriched,
      source: "breezy_enrichment",
      durableWrite: false,
      note: "Refreshed resume/questionnaire from Breezy detail APIs (in-memory only)",
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: Boolean(seed),
      candidateId: id,
      candidate: seed ? { ...seed } : null,
      source: seed ? "ingestion_cache" : "none",
      durableWrite: false,
      note: `Breezy refresh exception: ${message}`,
      error: message,
    };
  }
}
