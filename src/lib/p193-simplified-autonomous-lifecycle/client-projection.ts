import {
  mapLegacyWorkflowToP193State,
  mapPaperworkStatusToP193,
} from "@/lib/p193-simplified-autonomous-lifecycle/migrationAdapter";
import { createP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/recordFactory";
import {
  emptyMetadata,
  type P193LifecycleRecord,
  type P193LifecycleState,
  type P193PaperworkEnvelopeStatus,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";

/** Serializable view model for Client Components (no secrets / minimal PII). */
export type P193CandidateStatusViewModel = {
  candidateId: string;
  simplifiedStage: P193LifecycleState;
  qualificationResult: string | null;
  confidence: number | null;
  paperworkStatus: P193PaperworkEnvelopeStatus;
  dropboxStatus: P193PaperworkEnvelopeStatus;
  reminderCount: number;
  lastReminderAt: string | null;
  lastViewedAt: string | null;
  signatureTimestamp: string | null;
  readyForAssignment: boolean;
  nearbyJobCount: number;
  nearestDistanceMiles: number | null;
  timeline: Array<{ at: string; label: string; detail: string }>;
  stale: boolean;
  missing: boolean;
  projectedFromLegacy: boolean;
};

export type P193LegacyRowProjectionInput = {
  candidateId: string;
  workflowStatus?: string | null;
  recommendedStage?: string | null;
  paperworkStatus?: string | null;
  signatureRequestId?: string | null;
  notes?: string[];
  paperworkViewedAt?: string | null;
  paperworkSignedAt?: string | null;
  paperworkSentAt?: string | null;
  updatedAt?: string | null;
  nowMs?: number;
};

/**
 * Pure mapper: legacy workflow row → P193 lifecycle record.
 * No filesystem, database, env, or production writes.
 */
export function projectCandidateRowToP193(
  input: P193LegacyRowProjectionInput,
): P193LifecycleRecord {
  const state = mapLegacyWorkflowToP193State({
    workflowStatus: input.workflowStatus,
    recommendedStage: input.recommendedStage,
    paperworkStatus: input.paperworkStatus,
    signatureRequestId: input.signatureRequestId,
    notes: input.notes,
  });
  const base = createP193Record({
    candidateId: input.candidateId,
    state,
    legacyWorkflowStatus: input.workflowStatus ?? null,
  });
  const paperworkStatus = mapPaperworkStatusToP193(input.paperworkStatus);
  return {
    ...base,
    metadata: {
      ...emptyMetadata(),
      paperworkStatus,
      lastViewedAt: input.paperworkViewedAt ?? null,
      signatureTimestamp: input.paperworkSignedAt ?? null,
      lastStatusChangeAt: input.paperworkSentAt ?? base.updatedAt,
    },
    timeline: [
      {
        at: base.enteredAt,
        state: "Applied",
        detail: "Projected from legacy workflow (read-only)",
      },
      ...(state !== "Applied"
        ? [
            {
              at: base.enteredAt,
              state,
              detail: `Mapped from ${input.workflowStatus ?? "unknown"}`,
            },
          ]
        : []),
    ],
  };
}

/** Convert a P193 record (or legacy projection) into a client-safe view model. */
export function toP193CandidateStatusViewModel(input: {
  record: P193LifecycleRecord | null;
  candidateId: string;
  projectedFromLegacy?: boolean;
  staleAfterMs?: number;
  nowMs?: number;
}): P193CandidateStatusViewModel {
  const nowMs = input.nowMs ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? 14 * 24 * 60 * 60 * 1000;

  if (!input.record) {
    return {
      candidateId: input.candidateId,
      simplifiedStage: "Applied",
      qualificationResult: null,
      confidence: null,
      paperworkStatus: "not_sent",
      dropboxStatus: "not_sent",
      reminderCount: 0,
      lastReminderAt: null,
      lastViewedAt: null,
      signatureTimestamp: null,
      readyForAssignment: false,
      nearbyJobCount: 0,
      nearestDistanceMiles: null,
      timeline: [],
      stale: false,
      missing: true,
      projectedFromLegacy: false,
    };
  }

  const updatedMs = Date.parse(input.record.updatedAt);
  const stale = Number.isFinite(updatedMs) ? nowMs - updatedMs > staleAfterMs : false;

  return {
    candidateId: input.record.candidateId,
    simplifiedStage: input.record.state,
    qualificationResult: input.record.metadata.aiDecision,
    confidence: input.record.metadata.confidenceScore,
    paperworkStatus: input.record.metadata.paperworkStatus,
    dropboxStatus: input.record.metadata.paperworkStatus,
    reminderCount: input.record.metadata.reminderCount,
    lastReminderAt: input.record.metadata.lastReminderAt,
    lastViewedAt: input.record.metadata.lastViewedAt,
    signatureTimestamp: input.record.metadata.signatureTimestamp,
    readyForAssignment: input.record.state === "Ready For Assignment",
    nearbyJobCount: input.record.metadata.nearbyJobs.length,
    nearestDistanceMiles: input.record.metadata.distanceToNearestWorkMiles,
    timeline: input.record.timeline.map((e) => ({
      at: e.at,
      label: e.state === "AI Reviewing" ? "AI Reviewed" : e.state,
      detail: e.detail,
    })),
    stale,
    missing: false,
    projectedFromLegacy: Boolean(input.projectedFromLegacy),
  };
}

/** Pure: legacy row → client view model (no storage). */
export function projectLegacyRowToStatusViewModel(
  input: P193LegacyRowProjectionInput,
): P193CandidateStatusViewModel {
  const record = projectCandidateRowToP193(input);
  return toP193CandidateStatusViewModel({
    record,
    candidateId: input.candidateId,
    projectedFromLegacy: true,
    nowMs: input.nowMs,
  });
}
