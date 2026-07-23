import {
  createP193Record,
} from "@/lib/p193-simplified-autonomous-lifecycle/recordFactory";
import { emptyMetadata } from "@/lib/p193-simplified-autonomous-lifecycle/types";
import {
  P193_BRIDGE_NOTE,
  P193_RECOMMENDED_STAGE,
  P193_SYSTEM_RECRUITER,
  assertBridgeSafety,
  projectQualifiedToP192Prerequisites,
} from "@/lib/p193-simplified-autonomous-lifecycle/paperworkBridge";
import { upsertP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";
import type { P193AiQualificationResult } from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
import { evaluateP193AiQualification } from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { assertInsideCohort } from "@/lib/p193-2-simplified-lifecycle-pilot/selectCohort";
import type {
  P1932BridgeAttempt,
  P1932FrozenCohort,
  P1932PilotAuthority,
} from "@/lib/p193-2-simplified-lifecycle-pilot/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";

/**
 * Scoped pilot flags — never global enablement. Reminder sending stays false.
 */
export function buildScopedPilotAuthority(input: {
  cohort: P1932FrozenCohort;
  confirmedQualifiedIds: string[];
  nowMs?: number;
}): P1932PilotAuthority {
  const nowMs = input.nowMs ?? Date.now();
  return {
    pilotId: input.cohort.pilotId,
    fingerprint: input.cohort.fingerprint,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: input.cohort.expiresAt,
    maxCandidates: 10,
    confirmedQualifiedIds: [...input.confirmedQualifiedIds],
    flagsScoped: {
      enabled: true,
      aiAutoQualifyEnabled: true,
      paperworkBridgeEnabled: true,
      reminderSendEnabled: false,
      readyForAssignmentEnabled: true,
      dropboxObserverEnabled: true,
    },
  };
}

/**
 * Bridge one Qualified candidate → P193 Qualified record + legacy Paperwork Needed.
 * Concurrency = 1 (caller loops sequentially). Does not send paperwork.
 */
export async function executeP1932BridgeForCandidate(input: {
  cohort: P1932FrozenCohort;
  authority: P1932PilotAuthority;
  candidateId: string;
  candidate: BreezyCandidate;
  existingWorkflow?: CandidateWorkflowRecord | null;
}): Promise<P1932BridgeAttempt> {
  assertInsideCohort(input.cohort, input.candidateId);
  if (!input.authority.confirmedQualifiedIds.includes(input.candidateId)) {
    return {
      candidateId: input.candidateId,
      ok: false,
      bridged: false,
      simplifiedState: null,
      legacyWorkflowStatus: null,
      error: "not_in_confirmed_qualified_set",
      duplicatePrevented: false,
    };
  }
  if (Date.parse(input.authority.expiresAt) < Date.now()) {
    return {
      candidateId: input.candidateId,
      ok: false,
      bridged: false,
      simplifiedState: null,
      legacyWorkflowStatus: null,
      error: "pilot_authority_expired",
      duplicatePrevented: false,
    };
  }

  const existing = input.existingWorkflow;
  if (existing?.signatureRequestId || (existing?.paperworkStatus && existing.paperworkStatus !== "not_sent")) {
    return {
      candidateId: input.candidateId,
      ok: true,
      bridged: false,
      simplifiedState: null,
      legacyWorkflowStatus: existing.workflowStatus,
      error: "prior_envelope_or_paperwork",
      duplicatePrevented: true,
    };
  }
  if (existing?.workflowStatus === "Paperwork Needed" && (existing.notes ?? []).some((n) => n.includes("P193_SIMPLIFIED"))) {
    return {
      candidateId: input.candidateId,
      ok: true,
      bridged: false,
      simplifiedState: "Qualified",
      legacyWorkflowStatus: "Paperwork Needed",
      error: "already_bridged",
      duplicatePrevented: true,
    };
  }

  const ai: P193AiQualificationResult = evaluateP193AiQualification({
    candidate: input.candidate,
    workflowStatus: existing?.workflowStatus,
    questionnaireScore: input.candidate.hasQuestionnaire ? 70 : 35,
    nearbyJobs: [
      {
        jobId: input.candidate.positionId ?? "unknown",
        title: input.candidate.positionName ?? "",
        city: input.candidate.city ?? "",
        state: input.candidate.state ?? "",
        zip: input.candidate.zipCode ?? undefined,
      },
    ],
  });

  const now = new Date().toISOString();
  let record = createP193Record({
    candidateId: input.candidateId,
    state: "AI Reviewing",
    legacyWorkflowStatus: existing?.workflowStatus ?? null,
  });
  record = {
    ...record,
    previousState: "AI Reviewing",
    state: "Qualified",
    enteredAt: now,
    updatedAt: now,
    metadata: {
      ...emptyMetadata(),
      ...ai.metadata,
      recommendedHireAudit: P193_RECOMMENDED_STAGE,
      operatorApprovalAudit: P193_BRIDGE_NOTE,
      recruiterAssignmentAudit: P193_SYSTEM_RECRUITER,
      lastStatusChangeAt: now,
    },
    timeline: [
      ...record.timeline,
      { at: now, state: "AI Reviewing", detail: `AI decision=${ai.decision} confidence=${ai.confidenceScore}` },
      { at: now, state: "Qualified", detail: "P193.2 pilot operator-confirmed Qualified" },
    ],
    version: record.version + 1,
  };
  await upsertP193Record(record);

  const projection = projectQualifiedToP192Prerequisites({
    record,
    existing,
    flags: {
      enabled: true,
      aiAutoQualifyEnabled: true,
      paperworkBridgeEnabled: true,
      reminderSendEnabled: false,
      readyForAssignmentEnabled: false,
    },
    authorized: true,
  });
  assertBridgeSafety(projection);
  if (!projection.shouldProject || !projection.patch) {
    return {
      candidateId: input.candidateId,
      ok: false,
      bridged: false,
      simplifiedState: "Qualified",
      legacyWorkflowStatus: existing?.workflowStatus ?? null,
      error: projection.blockers.join(",") || "bridge_blocked",
      duplicatePrevented: false,
    };
  }

  const updated = await upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: "Paperwork Needed",
    recommendedStage: projection.patch.recommendedStage ?? P193_RECOMMENDED_STAGE,
    assignedRecruiter: projection.patch.assignedRecruiter ?? P193_SYSTEM_RECRUITER,
    recruiterAssignmentSource: "auto",
    recruiterAssignmentReason: "P193.2 simplified lifecycle pilot bridge",
    progressionReason: projection.patch.progressionReason ?? "P193.2 pilot bridge",
    note: P193_BRIDGE_NOTE,
    skipOwnershipLedger: false,
    audit: {
      action: "p193_2_paperwork_bridge",
      metadata: {
        pilotId: input.authority.pilotId,
        fingerprint: input.authority.fingerprint,
      },
    },
  });

  return {
    candidateId: input.candidateId,
    ok: true,
    bridged: true,
    simplifiedState: "Qualified",
    legacyWorkflowStatus: updated.workflowStatus,
    error: null,
    duplicatePrevented: false,
  };
}

export async function executeP1932BridgeSequential(input: {
  cohort: P1932FrozenCohort;
  authority: P1932PilotAuthority;
  candidatesById: Record<string, BreezyCandidate>;
  workflows: Record<string, CandidateWorkflowRecord>;
}): Promise<P1932BridgeAttempt[]> {
  const attempts: P1932BridgeAttempt[] = [];
  for (const id of input.authority.confirmedQualifiedIds) {
    const candidate = input.candidatesById[id];
    if (!candidate) {
      attempts.push({
        candidateId: id,
        ok: false,
        bridged: false,
        simplifiedState: null,
        legacyWorkflowStatus: null,
        error: "candidate_missing",
        duplicatePrevented: false,
      });
      continue;
    }
    // concurrency = 1
    // eslint-disable-next-line no-await-in-loop
    const attempt = await executeP1932BridgeForCandidate({
      cohort: input.cohort,
      authority: input.authority,
      candidateId: id,
      candidate,
      existingWorkflow: input.workflows[id] ?? null,
    });
    attempts.push(attempt);
  }
  return attempts;
}
