import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildRecruiterExplanation,
  hasActivePaperwork,
  hasExistingP2041Recommendation,
  questionnaireEvidenceHash,
  resumeEvidenceHash,
  splitFactors,
  stageBlocked,
} from "@/lib/p204-1-supervised-qualification-pilot/evidence";
import { assertCohortImmutable } from "@/lib/p204-1-supervised-qualification-pilot/freeze";
import type { P2041EligibleCandidate } from "@/lib/p204-1-supervised-qualification-pilot/select";
import { upsertP2041Recommendation } from "@/lib/p204-1-supervised-qualification-pilot/store";
import {
  P204_1_ADVANCE_CONFIDENCE_THRESHOLD,
  P204_1_ENGINE_VERSION,
  P204_1_NOTE_MARKER,
  P204_1_SCORING_VERSION,
  type P2041Authorization,
  type P2041FrozenCohort,
  type P2041OperatorQueueEntry,
  type P2041RecommendationRecord,
} from "@/lib/p204-1-supervised-qualification-pilot/types";

const LIFECYCLE_FIELDS = [
  "workflowStatus",
  "paperworkStatus",
  "signatureRequestId",
  "paperworkSentAt",
  "assignedRecruiter",
] as const;

export type P2041WriteAttempt = {
  candidateId: string;
  ok: boolean;
  detail: string;
  recommendationWritten: boolean;
  lifecycleFieldsChanged: string[];
};

export type P2041ExecutionResult = {
  cohortId: string;
  fingerprint: string;
  attempted: number;
  written: number;
  skipped: number;
  failed: number;
  attempts: P2041WriteAttempt[];
  records: P2041RecommendationRecord[];
  operatorQueue: P2041OperatorQueueEntry[];
  lifecycleChanges: 0;
  paperworkNeededCreated: 0;
  rejectionWrites: 0;
  dropboxCalls: 0;
  melWrites: 0;
};

function safetyGate(input: {
  member: P2041FrozenCohort["members"][number];
  workflow: CandidateWorkflowRecord | undefined;
  candidate: BreezyCandidate | undefined;
  engineVersion: string;
  scoringVersion: string;
}): { ok: true } | { ok: false; detail: string } {
  if (input.engineVersion !== P204_1_ENGINE_VERSION) {
    return { ok: false, detail: "engine_version_changed" };
  }
  if (input.scoringVersion !== P204_1_SCORING_VERSION) {
    return { ok: false, detail: "scoring_version_changed" };
  }
  if (!input.workflow) return { ok: false, detail: "workflow_missing" };
  if (!input.candidate) return { ok: false, detail: "candidate_missing" };
  if (input.workflow.workflowStatus !== "Applied") {
    return { ok: false, detail: "no_longer_applied" };
  }
  if (hasActivePaperwork(input.workflow)) {
    return { ok: false, detail: "active_envelope_or_paperwork" };
  }
  if (stageBlocked(input.candidate.stage)) {
    return { ok: false, detail: "withdrawn_archived_or_held" };
  }
  const workflowVersion = Date.parse(input.workflow.updatedAt || "") || 0;
  if (workflowVersion !== input.member.workflowVersion) {
    return { ok: false, detail: "evidence_or_state_changed_after_freeze" };
  }
  const qHash = questionnaireEvidenceHash(input.candidate);
  const rHash = resumeEvidenceHash(input.candidate);
  if (qHash !== input.member.questionnaireHash || rHash !== input.member.resumeHash) {
    return { ok: false, detail: "evidence_changed_after_freeze" };
  }
  if (
    input.member.recommendation === "Advance" &&
    !(
      input.candidate.hasQuestionnaire ||
      (input.candidate.questionnaireAnswers?.length ?? 0) >= 4
    )
  ) {
    return { ok: false, detail: "advance_missing_questionnaire" };
  }
  if (
    input.member.recommendation === "Advance" &&
    input.member.confidence < P204_1_ADVANCE_CONFIDENCE_THRESHOLD
  ) {
    return { ok: false, detail: "below_advance_threshold" };
  }
  return { ok: true };
}

export async function executeP2041RecommendationPilot(input: {
  cohort: P2041FrozenCohort;
  authorization: P2041Authorization;
  selectedById: Map<string, P2041EligibleCandidate>;
}): Promise<P2041ExecutionResult> {
  const attempts: P2041WriteAttempt[] = [];
  const records: P2041RecommendationRecord[] = [];
  const operatorQueue: P2041OperatorQueueEntry[] = [];
  let written = 0;
  let skipped = 0;
  let failed = 0;

  if (!input.authorization.allowRecommendationWrites || input.authorization.allowLifecycleWrites) {
    return {
      cohortId: input.cohort.cohortId,
      fingerprint: input.cohort.fingerprint,
      attempted: 0,
      written: 0,
      skipped: 0,
      failed: 0,
      attempts: [],
      records: [],
      operatorQueue: [],
      lifecycleChanges: 0,
      paperworkNeededCreated: 0,
      rejectionWrites: 0,
      dropboxCalls: 0,
      melWrites: 0,
    };
  }
  if (input.authorization.fingerprint !== input.cohort.fingerprint) {
    return {
      cohortId: input.cohort.cohortId,
      fingerprint: input.cohort.fingerprint,
      attempted: 0,
      written: 0,
      skipped: 0,
      failed: 1,
      attempts: [
        {
          candidateId: "*",
          ok: false,
          detail: "authorization_fingerprint_mismatch",
          recommendationWritten: false,
          lifecycleFieldsChanged: [],
        },
      ],
      records: [],
      operatorQueue: [],
      lifecycleChanges: 0,
      paperworkNeededCreated: 0,
      rejectionWrites: 0,
      dropboxCalls: 0,
      melWrites: 0,
    };
  }
  if (Date.parse(input.authorization.expiresAt) < Date.now()) {
    return {
      cohortId: input.cohort.cohortId,
      fingerprint: input.cohort.fingerprint,
      attempted: 0,
      written: 0,
      skipped: 0,
      failed: 1,
      attempts: [
        {
          candidateId: "*",
          ok: false,
          detail: "authorization_expired",
          recommendationWritten: false,
          lifecycleFieldsChanged: [],
        },
      ],
      records: [],
      operatorQueue: [],
      lifecycleChanges: 0,
      paperworkNeededCreated: 0,
      rejectionWrites: 0,
      dropboxCalls: 0,
      melWrites: 0,
    };
  }

  for (const member of input.cohort.members) {
    try {
      assertCohortImmutable(input.cohort, member.candidateId);
    } catch (err) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        recommendationWritten: false,
        lifecycleFieldsChanged: [],
      });
      continue;
    }

    const workflows = await getCandidateWorkflowState();
    const workflow = workflows[member.candidateId];
    const selected = input.selectedById.get(member.candidateId);
    const candidate = selected?.candidate;
    const gate = safetyGate({
      member,
      workflow,
      candidate,
      engineVersion: input.cohort.engineVersion,
      scoringVersion: input.cohort.scoringVersion,
    });
    if (!gate.ok) {
      skipped += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: gate.detail,
        recommendationWritten: false,
        lifecycleFieldsChanged: [],
      });
      continue;
    }

    const decision = selected!.decision;
    const factors = splitFactors(decision);
    const explanation = buildRecruiterExplanation({
      recommendation: member.recommendation,
      confidence: member.confidence,
      decision,
    });
    const record: P2041RecommendationRecord = {
      candidateId: member.candidateId,
      redactedCandidateId: member.redactedCandidateId,
      cohortId: input.cohort.cohortId,
      fingerprint: input.cohort.fingerprint,
      recommendation: member.recommendation,
      confidence: member.confidence,
      hardGates: factors.hardGates,
      positiveFactors: factors.positiveFactors,
      negativeFactors: factors.negativeFactors,
      reasonCodes: decision.reasonCodes,
      recruiterExplanation: explanation,
      evidenceFreshness: member.sourceTimestamp,
      nearbyJobSignal:
        decision.components.nearestJobMiles != null
          ? `nearest~${Math.round(decision.components.nearestJobMiles)}mi`
          : "no_distance_signal",
      questionnaireCompleteness:
        (candidate!.questionnaireAnswers?.length ?? 0) >= 8
          ? "rich"
          : (candidate!.questionnaireAnswers?.length ?? 0) >= 4
            ? "partial"
            : "missing",
      duplicateStatus: decision.components.duplicateSuspect ? "suspect" : "clear",
      recommendedOperatorAction:
        member.recommendation === "Advance"
          ? "Review and approve/override — do not auto-advance in P204.1"
          : member.recommendation === "Reject"
            ? "Confirm reject or override to Review — no rejection write in P204.1"
            : "Complete recruiter review with AI evidence packet",
      engineVersion: P204_1_ENGINE_VERSION,
      scoringVersion: P204_1_SCORING_VERSION,
      evidenceFingerprint: member.evidenceHash,
      writtenAt: new Date().toISOString(),
      workflowStatusAtWrite: workflow!.workflowStatus,
      operatorDecision: null,
      operatorDecisionAt: null,
      operatorDecisionBy: null,
      operatorNotes: null,
    };

    const before = Object.fromEntries(
      LIFECYCLE_FIELDS.map((k) => [k, (workflow as Record<string, unknown>)[k] ?? null]),
    );

    const upserted = await upsertP2041Recommendation(record);

    let afterWorkflow = workflow!;
    // Recommendation metadata audit only — no status / paperwork / ownership change.
    // Skip note rewrite on idempotent store hit when marker already present.
    if (upserted.created || !hasExistingP2041Recommendation(workflow)) {
      afterWorkflow = await upsertCandidateWorkflow({
        candidateId: member.candidateId,
        note: `${P204_1_NOTE_MARKER} ${member.recommendation} conf=${member.confidence} cohort=${input.cohort.cohortId} fp=${member.evidenceHash}`,
        audit: {
          action: "p204_1_ai_recommendation",
          byUserId: input.authorization.actor,
          metadata: {
            cohortId: input.cohort.cohortId,
            fingerprint: input.cohort.fingerprint,
            recommendation: member.recommendation,
            confidence: member.confidence,
            evidenceFingerprint: member.evidenceHash,
            engineVersion: P204_1_ENGINE_VERSION,
            scoringVersion: P204_1_SCORING_VERSION,
            created: upserted.created,
          },
        },
      });
    }

    const lifecycleFieldsChanged = LIFECYCLE_FIELDS.filter(
      (k) => String((afterWorkflow as Record<string, unknown>)[k] ?? null) !== String(before[k]),
    );
    if (lifecycleFieldsChanged.length > 0) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: `lifecycle_changed:${lifecycleFieldsChanged.join(",")}`,
        recommendationWritten: true,
        lifecycleFieldsChanged: [...lifecycleFieldsChanged],
      });
      continue;
    }

    written += 1;
    records.push(upserted.record);
    attempts.push({
      candidateId: member.candidateId,
      ok: true,
      detail: upserted.created ? "written" : "idempotent_skip",
      recommendationWritten: true,
      lifecycleFieldsChanged: [],
    });

    const warnings = [
      ...factors.hardGates,
      ...factors.negativeFactors.filter((n) => /missing|duplicate|low_|insufficient/.test(n)),
    ].slice(0, 6);

    operatorQueue.push({
      candidateId: member.candidateId,
      redactedCandidateId: member.redactedCandidateId,
      candidateDisplayName: null,
      recommendation: member.recommendation,
      confidence: member.confidence,
      topReasons: decision.reasonCodes.slice(0, 5),
      evidenceWarnings: warnings,
      nearbyJobs: record.nearbyJobSignal,
      currentStage: afterWorkflow.workflowStatus,
      allowedDecisions: [
        "approve_recommendation",
        "override_to_review",
        "override_to_advance",
        "override_to_reject",
        "defer",
      ],
      operatorDecision: null,
    });
  }

  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    attempted: input.cohort.members.length,
    written,
    skipped,
    failed,
    attempts,
    records,
    operatorQueue,
    lifecycleChanges: 0,
    paperworkNeededCreated: 0,
    rejectionWrites: 0,
    dropboxCalls: 0,
    melWrites: 0,
  };
}
