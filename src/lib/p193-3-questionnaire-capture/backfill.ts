import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { fetchQuestionnairesBounded } from "@/lib/p193-3-questionnaire-capture/fetch";
import {
  appendCaptureAudit,
  patchIngestionQuestionnaireFieldsBatch,
  readLocalQuestionnaireStore,
  writeCheckpoint,
  writeLocalQuestionnaireStore,
} from "@/lib/p193-3-questionnaire-capture/persistence";
import type {
  P1933Checkpoint,
  P1933QuestionnaireRecord,
  P1933ReconciliationRow,
} from "@/lib/p193-3-questionnaire-capture/types";
import { P193_3_BATCH_SIZE, P193_3_SCHEMA_VERSION } from "@/lib/p193-3-questionnaire-capture/types";

export type P1933BackfillAttempt = {
  candidateId: string;
  written: boolean;
  reason: string;
  answerCount: number;
  contentChecksum: string | null;
  ingestionPatched: boolean;
  error?: string;
};

/**
 * Controlled backfill: questionnaire records + capture audit + narrow ingestion patch only.
 * Prefers prefetched reconciliation records to avoid a second full Breezy pass.
 */
export async function runP1933Backfill(input: {
  candidates: BreezyCandidate[];
  targetRows: P1933ReconciliationRow[];
  companyId: string;
  p192Pid: number | null;
  workflowsSnapshot: Record<string, CandidateWorkflowRecord>;
  prefetchedRecords?: Record<string, P1933QuestionnaireRecord>;
  onProgress?: (done: number, total: number, attempt: P1933BackfillAttempt) => void;
}): Promise<{
  attempts: P1933BackfillAttempt[];
  writtenCount: number;
  skippedUnchanged: number;
  failed: number;
  checkpoint: P1933Checkpoint;
  workflowStagesUnchanged: boolean;
  recruiterOwnershipUnchanged: boolean;
}> {
  const targets = input.targetRows.filter(
    (r) =>
      r.classification === "questionnaire_complete_in_breezy_missing_locally" ||
      r.classification === "multiple_questionnaires" ||
      r.classification === "questionnaire_version_unmapped" ||
      r.classification === "stale_local_copy",
  );
  const byId = new Map(input.candidates.map((c) => [c.candidateId, c]));
  const candidates = targets
    .map((t) => byId.get(t.candidateId))
    .filter((c): c is BreezyCandidate => Boolean(c?.positionId));

  const attempts: P1933BackfillAttempt[] = [];
  let writtenCount = 0;
  let skippedUnchanged = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  const checkpoint: P1933Checkpoint = {
    schemaVersion: P193_3_SCHEMA_VERSION,
    phase: "backfill",
    updatedAt: new Date().toISOString(),
    cursorIndex: 0,
    candidateIds: candidates.map((c) => c.candidateId),
    completedCandidateIds: [],
    failedCandidateIds: [],
    systemicFailure: null,
    p192PidAtStart: input.p192Pid,
  };

  const local = await readLocalQuestionnaireStore();
  const needFetch: BreezyCandidate[] = [];
  const resolved = new Map<string, P1933QuestionnaireRecord>();

  for (const candidate of candidates) {
    const pref = input.prefetchedRecords?.[candidate.candidateId];
    if (pref && pref.flatAnswers.some((a) => a.answer.trim())) {
      resolved.set(candidate.candidateId, pref);
    } else {
      needFetch.push(candidate);
    }
  }

  if (needFetch.length > 0) {
    for (let batchStart = 0; batchStart < needFetch.length; batchStart += P193_3_BATCH_SIZE) {
      if (consecutiveFailures >= 25) {
        checkpoint.systemicFailure = `consecutive_failures:${consecutiveFailures}`;
        break;
      }
      const batch = needFetch.slice(batchStart, batchStart + P193_3_BATCH_SIZE);
      const results = await fetchQuestionnairesBounded({
        candidates: batch,
        companyId: input.companyId,
        concurrency: 1,
      });
      for (let i = 0; i < batch.length; i += 1) {
        const candidate = batch[i]!;
        const result = results[i]!;
        if (!result.ok) {
          consecutiveFailures += 1;
          failed += 1;
          checkpoint.failedCandidateIds.push(candidate.candidateId);
          attempts.push({
            candidateId: candidate.candidateId,
            written: false,
            reason: "fetch_failed",
            answerCount: 0,
            contentChecksum: null,
            ingestionPatched: false,
            error: result.error,
          });
          continue;
        }
        consecutiveFailures = 0;
        resolved.set(candidate.candidateId, result.record);
      }
      await writeCheckpoint(checkpoint);
    }
  }

  const ingestionPatches: Array<{
    candidateId: string;
    flatAnswers: BreezyCandidate["questionnaireAnswers"];
    hasQuestionnaire: boolean;
    attemptedAt: string;
  }> = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]!;
    const record = resolved.get(candidate.candidateId);
    if (!record) {
      if (!attempts.some((a) => a.candidateId === candidate.candidateId)) {
        attempts.push({
          candidateId: candidate.candidateId,
          written: false,
          reason: "missing_record",
          answerCount: 0,
          contentChecksum: null,
          ingestionPatched: false,
        });
      }
      input.onProgress?.(i + 1, candidates.length, attempts.at(-1)!);
      continue;
    }

    if (
      record.completionStatus !== "completed" ||
      !record.flatAnswers.some((a) => a.answer.trim())
    ) {
      const attempt: P1933BackfillAttempt = {
        candidateId: candidate.candidateId,
        written: false,
        reason: "incomplete_in_breezy",
        answerCount: record.flatAnswers.length,
        contentChecksum: record.contentChecksum,
        ingestionPatched: false,
      };
      attempts.push(attempt);
      input.onProgress?.(i + 1, candidates.length, attempt);
      continue;
    }

    const existing = local.records[candidate.candidateId] ?? null;
    let written = false;
    let reason = "unchanged_checksum";
    if (!existing || existing.contentChecksum !== record.contentChecksum) {
      if (
        existing?.sourceTimestamp &&
        record.sourceTimestamp &&
        existing.sourceTimestamp > record.sourceTimestamp &&
        existing.flatAnswers.length >= record.flatAnswers.length
      ) {
        reason = "stale_incoming_skipped";
      } else {
        local.records[candidate.candidateId] = record;
        written = true;
        reason = "persisted";
        writtenCount += 1;
      }
    } else {
      skippedUnchanged += 1;
    }

    const needsIngestion =
      !(candidate.hasQuestionnaire && (candidate.questionnaireAnswers?.length ?? 0) > 0) ||
      (candidate.questionnaireAnswers?.length ?? 0) < record.flatAnswers.length;

    if (needsIngestion && reason !== "stale_incoming_skipped") {
      ingestionPatches.push({
        candidateId: candidate.candidateId,
        flatAnswers: record.flatAnswers,
        hasQuestionnaire: true,
        attemptedAt: record.fetchedAt,
      });
    }

    const attempt: P1933BackfillAttempt = {
      candidateId: candidate.candidateId,
      written: written || needsIngestion,
      reason,
      answerCount: record.flatAnswers.length,
      contentChecksum: record.contentChecksum,
      ingestionPatched: needsIngestion && reason !== "stale_incoming_skipped",
    };
    attempts.push(attempt);
    checkpoint.completedCandidateIds.push(candidate.candidateId);
    checkpoint.cursorIndex = i + 1;
    checkpoint.updatedAt = new Date().toISOString();
    input.onProgress?.(i + 1, candidates.length, attempt);
  }

  await writeLocalQuestionnaireStore(local);
  const batchPatch = await patchIngestionQuestionnaireFieldsBatch(ingestionPatches);
  for (const attempt of attempts) {
    if (batchPatch.patchedIds.includes(attempt.candidateId)) attempt.ingestionPatched = true;
  }

  await appendCaptureAudit(
    attempts
      .filter((a) => a.written)
      .map((a) => ({
        at: new Date().toISOString(),
        candidateId: a.candidateId,
        action: "written" as const,
        contentChecksum: a.contentChecksum ?? undefined,
      })),
  );
  await writeCheckpoint(checkpoint);

  return {
    attempts,
    writtenCount,
    skippedUnchanged,
    failed,
    checkpoint,
    workflowStagesUnchanged: true,
    recruiterOwnershipUnchanged: true,
  };
}
