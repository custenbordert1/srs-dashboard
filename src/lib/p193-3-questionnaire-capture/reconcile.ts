import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  checksumOfFlatAnswers,
  questionnaireVersionUnmapped,
} from "@/lib/p193-3-questionnaire-capture/normalize";
import { fetchQuestionnairesBounded } from "@/lib/p193-3-questionnaire-capture/fetch";
import {
  appendCaptureAudit,
  readLocalQuestionnaireStore,
  writeCheckpoint,
} from "@/lib/p193-3-questionnaire-capture/persistence";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type {
  P1933Checkpoint,
  P1933ReconciliationClass,
  P1933ReconciliationRow,
  P1933ReconciliationSummary,
  P1933QuestionnaireRecord,
} from "@/lib/p193-3-questionnaire-capture/types";
import { P193_3_BATCH_SIZE, P193_3_SCHEMA_VERSION } from "@/lib/p193-3-questionnaire-capture/types";
import { evaluatePilotEligibility } from "@/lib/p193-2-simplified-lifecycle-pilot/selectCohort";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function emptyClassCounts(): Record<P1933ReconciliationClass, number> {
  return {
    questionnaire_complete_in_breezy_and_captured: 0,
    questionnaire_complete_in_breezy_missing_locally: 0,
    questionnaire_incomplete_in_breezy: 0,
    questionnaire_endpoint_unavailable: 0,
    candidate_match_missing: 0,
    multiple_questionnaires: 0,
    questionnaire_version_unmapped: 0,
    malformed_response: 0,
    stale_local_copy: 0,
    unknown: 0,
  };
}

export function classifyQuestionnaireState(input: {
  candidate: BreezyCandidate;
  breezyRecord: P1933QuestionnaireRecord | null;
  localRecord: P1933QuestionnaireRecord | null;
  fetchError?: string;
  questionnaireCount?: number;
}): P1933ReconciliationClass {
  const { candidate, breezyRecord, localRecord } = input;
  if (!candidate.positionId?.trim()) return "candidate_match_missing";
  if (input.fetchError) return "questionnaire_endpoint_unavailable";
  if (!breezyRecord) return "unknown";

  const localAnswers = candidate.questionnaireAnswers ?? localRecord?.flatAnswers ?? [];
  const localCaptured =
    Boolean(candidate.hasQuestionnaire) ||
    localAnswers.length > 0 ||
    Boolean(localRecord?.flatAnswers.length);
  const breezyComplete =
    breezyRecord.completionStatus === "completed" &&
    breezyRecord.flatAnswers.some((a) => a.answer.trim());

  if ((input.questionnaireCount ?? 0) > 1) {
    return "multiple_questionnaires";
  }

  if (breezyRecord.completionStatus === "malformed") return "malformed_response";

  if (
    localCaptured &&
    breezyComplete &&
    localRecord &&
    breezyRecord.contentChecksum !== localRecord.contentChecksum &&
    (localRecord.sourceTimestamp ?? "") > (breezyRecord.sourceTimestamp ?? "")
  ) {
    return "stale_local_copy";
  }

  if (breezyComplete && localCaptured) {
    if (questionnaireVersionUnmapped(breezyRecord)) return "questionnaire_version_unmapped";
    return "questionnaire_complete_in_breezy_and_captured";
  }
  if (breezyComplete && !localCaptured) {
    if (questionnaireVersionUnmapped(breezyRecord)) return "questionnaire_version_unmapped";
    return "questionnaire_complete_in_breezy_missing_locally";
  }
  if (!breezyComplete) return "questionnaire_incomplete_in_breezy";
  return "unknown";
}

export async function runP1933Reconciliation(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  companyId: string;
  p192Pid: number | null;
  resumeFromIndex?: number;
  priorRows?: P1933ReconciliationRow[];
  priorRecordsById?: Record<string, P1933QuestionnaireRecord>;
  onProgress?: (done: number, total: number, row: P1933ReconciliationRow) => void;
}): Promise<{
  rows: P1933ReconciliationRow[];
  summary: P1933ReconciliationSummary;
  recordsById: Record<string, P1933QuestionnaireRecord>;
  checkpoint: P1933Checkpoint;
}> {
  const candidates = [...input.candidates];
  const localStore = await readLocalQuestionnaireStore();
  const rows: P1933ReconciliationRow[] = [...(input.priorRows ?? [])];
  const recordsById: Record<string, P1933QuestionnaireRecord> = {
    ...localStore.records,
    ...(input.priorRecordsById ?? {}),
  };
  const classCounts = emptyClassCounts();
  for (const row of rows) classCounts[row.classification] += 1;

  const startIndex = Math.min(Math.max(0, input.resumeFromIndex ?? 0), candidates.length);

  const checkpointBase: P1933Checkpoint = {
    schemaVersion: P193_3_SCHEMA_VERSION,
    phase: "reconcile",
    updatedAt: new Date().toISOString(),
    cursorIndex: startIndex,
    candidateIds: candidates.map((c) => c.candidateId),
    completedCandidateIds: rows.map((r) => r.candidateId),
    failedCandidateIds: [],
    systemicFailure: null,
    p192PidAtStart: input.p192Pid,
  };

  const systemicFailThreshold = 25;
  let consecutiveFailures = 0;

  for (let batchStart = startIndex; batchStart < candidates.length; batchStart += P193_3_BATCH_SIZE) {
    if (consecutiveFailures >= systemicFailThreshold) {
      checkpointBase.systemicFailure = `consecutive_fetch_failures:${consecutiveFailures}`;
      break;
    }

    const batch = candidates.slice(batchStart, batchStart + P193_3_BATCH_SIZE);
    const results = await fetchQuestionnairesBounded({
      candidates: batch,
      companyId: input.companyId,
      concurrency: 1,
    });

    for (let i = 0; i < batch.length; i += 1) {
      const candidate = batch[i]!;
      const result = results[i]!;
      const localRecord = localStore.records[candidate.candidateId] ?? null;

      let classification: P1933ReconciliationClass;
      let breezyRecord: P1933QuestionnaireRecord | null = null;
      let error: string | undefined;

      if (!result.ok) {
        const missingPosition = !candidate.positionId?.trim();
        if (!missingPosition) {
          consecutiveFailures += 1;
          checkpointBase.failedCandidateIds.push(candidate.candidateId);
        } else {
          // Missing position is a local data gap, not a Breezy outage.
          consecutiveFailures = 0;
        }
        classification = missingPosition
          ? "candidate_match_missing"
          : "questionnaire_endpoint_unavailable";
        error = result.error;
      } else {
        consecutiveFailures = 0;
        breezyRecord = result.record;
        recordsById[candidate.candidateId] = result.record;
        classification = classifyQuestionnaireState({
          candidate,
          breezyRecord: result.record,
          localRecord,
          questionnaireCount: result.questionnaireCount,
        });
        if (
          classification === "questionnaire_version_unmapped" &&
          !(candidate.hasQuestionnaire || (candidate.questionnaireAnswers?.length ?? 0) > 0) &&
          result.record.flatAnswers.some((a) => a.answer.trim())
        ) {
          classification = "questionnaire_complete_in_breezy_missing_locally";
        }
      }

      classCounts[classification] += 1;
      const row: P1933ReconciliationRow = {
        candidateId: candidate.candidateId,
        positionId: candidate.positionId ?? null,
        classification,
        breezyComplete: Boolean(
          breezyRecord &&
            breezyRecord.completionStatus === "completed" &&
            breezyRecord.flatAnswers.some((a) => a.answer.trim()),
        ),
        localCaptured:
          Boolean(candidate.hasQuestionnaire) || (candidate.questionnaireAnswers?.length ?? 0) > 0,
        answerCountBreezy: breezyRecord?.flatAnswers.length ?? 0,
        answerCountLocal: candidate.questionnaireAnswers?.length ?? 0,
        questionnaireTitle: breezyRecord?.questionnaireTitle ?? null,
        questionnaireVersion: breezyRecord?.questionnaireVersion ?? null,
        mappingFailures: breezyRecord?.unmappedQuestionCount ?? 0,
        contentChecksum:
          breezyRecord?.contentChecksum ?? checksumOfFlatAnswers(candidate.questionnaireAnswers),
        error,
      };
      rows.push(row);
      checkpointBase.completedCandidateIds.push(candidate.candidateId);
      checkpointBase.cursorIndex = batchStart + i + 1;
      checkpointBase.updatedAt = new Date().toISOString();
      input.onProgress?.(rows.length, candidates.length, row);
    }

    await writeCheckpoint(checkpointBase);
    await mkdir(recruitingDataDir(), { recursive: true });
    await writeFile(
      path.join(recruitingDataDir(), "p193-3-reconcile-state.json"),
      `${JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          cursorIndex: checkpointBase.cursorIndex,
          systemicFailure: checkpointBase.systemicFailure,
          rows,
          recordIds: Object.keys(recordsById),
          recordsById,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await appendCaptureAudit(
      rows.slice(-batch.length).map((r) => ({
        at: new Date().toISOString(),
        candidateId: r.candidateId,
        action: "classified" as const,
        classification: r.classification,
        contentChecksum: r.contentChecksum ?? undefined,
        error: r.error,
      })),
    );
  }

  let potentialGateClear = 0;
  for (const candidate of candidates) {
    const wf = input.workflows[candidate.candidateId];
    const current = evaluatePilotEligibility({ candidate, workflow: wf });
    if (current.ok) {
      potentialGateClear += 1;
      continue;
    }
    const onlyQ = current.blockers.length === 1 && current.blockers[0] === "missing_questionnaire";
    const row = rows.find((r) => r.candidateId === candidate.candidateId);
    if (onlyQ && row?.breezyComplete) potentialGateClear += 1;
  }

  const summary: P1933ReconciliationSummary = {
    generatedAt: new Date().toISOString(),
    totalApplicants: candidates.length,
    breezyQuestionnaireComplete: rows.filter((r) => r.breezyComplete).length,
    locallyCaptured: rows.filter((r) => r.localCaptured).length,
    missingLocally: classCounts.questionnaire_complete_in_breezy_missing_locally,
    incompleteInBreezy: classCounts.questionnaire_incomplete_in_breezy,
    endpointFailures: classCounts.questionnaire_endpoint_unavailable,
    mappingFailures: rows.reduce((n, r) => n + r.mappingFailures, 0),
    potentialP193GateClearAfterBackfill: potentialGateClear,
    classCounts,
  };

  return { rows, summary, recordsById, checkpoint: checkpointBase };
}
