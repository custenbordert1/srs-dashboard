import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import {
  P193_BRIDGE_NOTE,
  assertBridgeSafety,
  projectQualifiedToP192Prerequisites,
} from "@/lib/p193-simplified-autonomous-lifecycle/paperworkBridge";
import { createP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/recordFactory";
import { upsertP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";
import { DEFAULT_P193_FLAGS } from "@/lib/p193-simplified-autonomous-lifecycle/types";
import { evaluateP1934Calibration } from "@/lib/p193-4-qualification-calibration/calibratedScorer";
import type { P1934FrozenCohort } from "@/lib/p193-4-qualification-calibration/types";
import type { P1933QuestionnaireRecord } from "@/lib/p193-3-questionnaire-capture/types";
import { P193_4_MIN_QUALIFIED_TO_BRIDGE } from "@/lib/p193-4-qualification-calibration/types";

export type P1934BridgeAttempt = {
  candidateId: string;
  bridged: boolean;
  duplicatePrevented: boolean;
  reason: string;
  confidence: number | null;
  workflowStatusAfter: string | null;
};

export type P1934PilotAuthority = {
  pilotId: string;
  fingerprint: string;
  expiresAt: string;
  confirmedQualifiedIds: string[];
  authorizedAt: string;
};

export function buildP1934Authority(input: {
  cohort: P1934FrozenCohort;
  confirmedQualifiedIds: string[];
}): P1934PilotAuthority {
  return {
    pilotId: input.cohort.pilotId,
    fingerprint: input.cohort.fingerprint,
    expiresAt: input.cohort.expiresAt,
    confirmedQualifiedIds: [...input.confirmedQualifiedIds],
    authorizedAt: new Date().toISOString(),
  };
}

export async function executeP1934BridgeSequential(input: {
  cohort: P1934FrozenCohort;
  authority: P1934PilotAuthority;
  candidatesById: Record<string, BreezyCandidate>;
  workflows: Record<string, CandidateWorkflowRecord>;
  recordsById: Record<string, P1933QuestionnaireRecord>;
}): Promise<P1934BridgeAttempt[]> {
  if (input.authority.fingerprint !== input.cohort.fingerprint) {
    throw new Error("fingerprint_mismatch");
  }
  if (Date.parse(input.authority.expiresAt) < Date.now()) {
    throw new Error("authority_expired");
  }
  if (input.authority.confirmedQualifiedIds.length < P193_4_MIN_QUALIFIED_TO_BRIDGE) {
    throw new Error("below_minimum_qualified");
  }

  const attempts: P1934BridgeAttempt[] = [];
  const flags = {
    ...DEFAULT_P193_FLAGS,
    enabled: true,
    aiAutoQualifyEnabled: true,
    paperworkBridgeEnabled: true,
    reminderSendEnabled: false,
    readyForAssignmentEnabled: false,
  };

  for (const candidateId of input.authority.confirmedQualifiedIds) {
    const member = input.cohort.members.find((m) => m.candidateId === candidateId);
    const candidate = input.candidatesById[candidateId];
    const workflow = input.workflows[candidateId];
    if (!member || !candidate) {
      attempts.push({
        candidateId,
        bridged: false,
        duplicatePrevented: false,
        reason: "missing_candidate",
        confidence: null,
        workflowStatusAfter: null,
      });
      continue;
    }
    if (member.decision !== "Qualified") {
      attempts.push({
        candidateId,
        bridged: false,
        duplicatePrevented: false,
        reason: "not_qualified_in_frozen_cohort",
        confidence: member.confidence,
        workflowStatusAfter: workflow?.workflowStatus ?? null,
      });
      continue;
    }

    const priorPaper =
      Boolean(workflow?.signatureRequestId) ||
      Boolean(workflow?.paperworkSentAt) ||
      (workflow?.paperworkStatus && workflow.paperworkStatus !== "not_sent");
    if (priorPaper) {
      attempts.push({
        candidateId,
        bridged: false,
        duplicatePrevented: true,
        reason: "prior_envelope_or_paperwork",
        confidence: member.confidence,
        workflowStatusAfter: workflow?.workflowStatus ?? null,
      });
      continue;
    }
    if ((workflow?.notes ?? []).some((n) => n.includes("[P193_SIMPLIFIED]") || n.includes(P193_BRIDGE_NOTE))) {
      attempts.push({
        candidateId,
        bridged: false,
        duplicatePrevented: true,
        reason: "already_bridged",
        confidence: member.confidence,
        workflowStatusAfter: workflow?.workflowStatus ?? null,
      });
      continue;
    }

    const recordMeta = input.recordsById[candidateId];
    const score = evaluateP1934Calibration({
      candidate,
      mappedFields: recordMeta?.mappedQualificationFields,
      workflowStatus: workflow?.workflowStatus,
    });
    if (score.decision !== "Qualified") {
      attempts.push({
        candidateId,
        bridged: false,
        duplicatePrevented: false,
        reason: `score_changed_since_preview:${score.decision}`,
        confidence: score.confidence,
        workflowStatusAfter: workflow?.workflowStatus ?? null,
      });
      continue;
    }

    let record = createP193Record({ candidateId, state: "Qualified" });
    record = {
      ...record,
      metadata: {
        ...record.metadata,
        aiDecision: "Qualified",
        confidenceScore: score.confidence,
        questionnaireScore: score.components.questionnaireScore,
        resumeScore: score.components.resumeScore,
        experienceYears: score.experienceYears,
        aiSummary: score.explanation,
      },
      timeline: [
        ...record.timeline,
        {
          at: new Date().toISOString(),
          state: "Qualified",
          detail: `P193.4 calibrated qualify confidence=${score.confidence}`,
        },
      ],
    };
    await upsertP193Record(record);

    const projection = projectQualifiedToP192Prerequisites({
      record,
      flags,
      authorized: true,
    });
    assertBridgeSafety(projection);
    if (!projection.shouldProject || !projection.patch) {
      attempts.push({
        candidateId,
        bridged: false,
        duplicatePrevented: false,
        reason: "bridge_projection_blocked",
        confidence: score.confidence,
        workflowStatusAfter: workflow?.workflowStatus ?? null,
      });
      continue;
    }

    const nextNote = `${P193_BRIDGE_NOTE} pilot=${input.authority.pilotId} fp=${input.authority.fingerprint}`;
    await upsertCandidateWorkflow({
      candidateId,
      workflowStatus: "Paperwork Needed",
      recommendedStage: projection.patch.recommendedStage,
      assignedRecruiter: projection.patch.assignedRecruiter,
      recruiterAssignmentSource: "auto",
      recruiterAssignmentReason: "P193.4 calibrated simplified lifecycle pilot bridge",
      progressionReason: projection.patch.progressionReason ?? "P193.4 pilot bridge",
      note: nextNote,
      audit: {
        action: "p193_4_paperwork_bridge",
        metadata: {
          pilotId: input.authority.pilotId,
          fingerprint: input.authority.fingerprint,
        },
      },
    });

    attempts.push({
      candidateId,
      bridged: true,
      duplicatePrevented: false,
      reason: "bridged_paperwork_needed",
      confidence: score.confidence,
      workflowStatusAfter: "Paperwork Needed",
    });
  }

  return attempts;
}
