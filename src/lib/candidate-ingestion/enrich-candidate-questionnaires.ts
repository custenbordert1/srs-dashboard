import {
  enrichBreezyCandidateWithQuestionnairePayload,
  fetchBreezyCandidateEnrichmentPayload,
  type BreezyCandidate,
} from "@/lib/breezy-api";
import { mergeCandidateRecord } from "@/lib/candidate-ingestion/merge-candidate-record";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import {
  currentMtdDateRange,
  filterMtdCandidates,
} from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates } from "@/lib/candidate-ingestion/ingestion-store";

const ENRICHMENT_DELAY_MS = 250;
const FAILURE_RETRY_DELAY_MS = 2_500;
const MAX_FAILURE_RETRIES = 5;
const CHECKPOINT_EVERY = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: string | undefined): boolean {
  return Boolean(error?.toLowerCase().includes("rate limit"));
}

export type QuestionnaireEnrichmentCandidateResult = {
  candidateId: string;
  enriched: boolean;
  attempted: boolean;
  empty: boolean;
  failed: boolean;
  error?: string;
};

export type QuestionnaireEnrichmentCompletionReport = {
  generatedAt: string;
  candidatesScanned: number;
  candidatesEnriched: number;
  candidatesWithoutQuestionnaires: number;
  apiFailures: number;
  rateLimitRetries: number;
  questionnaireCompletionPct: number;
  alreadyEnrichedSkipped: number;
  pendingAtStart: number;
  stillPending: number;
};

export function candidateNeedsQuestionnaireEnrichment(candidate: BreezyCandidate): boolean {
  return !(candidate.questionnaireAnswers?.length || candidate.hasQuestionnaire);
}

export function candidatePendingQuestionnaireEnrichment(candidate: BreezyCandidate): boolean {
  if (!candidate.positionId?.trim() || !candidate.candidateId) return false;
  if (!candidateNeedsQuestionnaireEnrichment(candidate)) return false;
  return !candidate.questionnaireEnrichmentAttemptedAt;
}

/** Clear attempted timestamps for empty enrichments so parser fixes can re-fetch once. */
export function clearEmptyQuestionnaireEnrichmentAttempts(
  store: CandidateIngestionStoreFile,
  reference = new Date(),
): CandidateIngestionStoreFile {
  const candidates = { ...store.candidates };
  for (const candidate of filterMtdCandidates(listIngestedCandidates(store), currentMtdDateRange(reference))) {
    if ((candidate.questionnaireAnswers?.length ?? 0) > 0) continue;
    if (!candidate.questionnaireEnrichmentAttemptedAt) continue;
    candidates[candidate.candidateId] = {
      ...candidate,
      questionnaireEnrichmentAttemptedAt: undefined,
    };
  }
  return { ...store, candidates };
}

export function listMtdCandidatesMissingQuestionnaire(
  store: CandidateIngestionStoreFile,
  reference = new Date(),
): BreezyCandidate[] {
  return filterMtdCandidates(listIngestedCandidates(store), currentMtdDateRange(reference)).filter(
    (candidate) => candidate.positionId?.trim() && candidateNeedsQuestionnaireEnrichment(candidate),
  );
}

export function listMtdCandidatesPendingQuestionnaireEnrichment(
  store: CandidateIngestionStoreFile,
  reference = new Date(),
): BreezyCandidate[] {
  return filterMtdCandidates(listIngestedCandidates(store), currentMtdDateRange(reference)).filter(
    candidatePendingQuestionnaireEnrichment,
  );
}

export async function enrichCandidateWithQuestionnaireDetail(input: {
  candidate: BreezyCandidate;
  companyId: string;
}): Promise<QuestionnaireEnrichmentCandidateResult & { candidate: BreezyCandidate }> {
  const { candidate, companyId } = input;
  const base: QuestionnaireEnrichmentCandidateResult = {
    candidateId: candidate.candidateId,
    enriched: false,
    attempted: false,
    empty: false,
    failed: false,
  };

  if (!candidate.positionId?.trim() || !candidate.candidateId) {
    return { ...base, candidate };
  }
  if (!candidatePendingQuestionnaireEnrichment(candidate)) {
    return { ...base, candidate };
  }

  const payloadResult = await fetchBreezyCandidateEnrichmentPayload({
    companyId,
    positionId: candidate.positionId,
    candidateId: candidate.candidateId,
  });

  if (!payloadResult.ok) {
    return {
      ...base,
      candidate,
      failed: true,
      error: payloadResult.error,
    };
  }

  const enrichedCandidate = enrichBreezyCandidateWithQuestionnairePayload(candidate, payloadResult.payload);
  const hasAnswers = (enrichedCandidate.questionnaireAnswers?.length ?? 0) > 0;
  const storedCandidate: BreezyCandidate = {
    ...enrichedCandidate,
    questionnaireEnrichmentAttemptedAt: new Date().toISOString(),
    hasQuestionnaire: hasAnswers,
  };

  return {
    candidateId: candidate.candidateId,
    candidate: storedCandidate,
    enriched: hasAnswers,
    attempted: true,
    empty: !hasAnswers,
    failed: false,
  };
}

export async function enrichIngestionStoreQuestionnaires(input: {
  store: CandidateIngestionStoreFile;
  companyId: string;
  deadlineMs: number;
  reference?: Date;
  maxCandidates?: number;
  onCheckpoint?: (store: CandidateIngestionStoreFile) => Promise<void>;
}): Promise<{
  store: CandidateIngestionStoreFile;
  candidatesChecked: number;
  candidatesEnriched: number;
  candidatesWithoutQuestionnaires: number;
  apiFailures: number;
  rateLimitRetries: number;
}> {
  const candidates = listMtdCandidatesPendingQuestionnaireEnrichment(input.store, input.reference);
  const limit = input.maxCandidates ?? candidates.length;
  const candidatesToCheck = candidates.slice(0, limit);

  let candidatesEnriched = 0;
  let candidatesWithoutQuestionnaires = 0;
  let apiFailures = 0;
  let rateLimitRetries = 0;
  let processed = 0;
  const mergedCandidates = { ...input.store.candidates };
  let nextStore: CandidateIngestionStoreFile = { ...input.store, candidates: mergedCandidates };

  for (const candidate of candidatesToCheck) {
    if (Date.now() >= input.deadlineMs) break;

    const current = mergedCandidates[candidate.candidateId] ?? candidate;
    let result = await enrichCandidateWithQuestionnaireDetail({
      candidate: current,
      companyId: input.companyId,
    });

    let retries = 0;
    while (result.failed && retries < MAX_FAILURE_RETRIES && Date.now() < input.deadlineMs) {
      if (isRateLimitError(result.error)) rateLimitRetries += 1;
      await sleep(FAILURE_RETRY_DELAY_MS * (retries + 1));
      result = await enrichCandidateWithQuestionnaireDetail({
        candidate: current,
        companyId: input.companyId,
      });
      retries += 1;
    }

    if (result.failed) {
      apiFailures += 1;
      if (isRateLimitError(result.error)) rateLimitRetries += 1;
    } else {
      mergedCandidates[candidate.candidateId] = mergeCandidateRecord(
        mergedCandidates[candidate.candidateId],
        result.candidate,
      );
      if (result.enriched) candidatesEnriched += 1;
      if (result.empty) candidatesWithoutQuestionnaires += 1;
    }

    processed += 1;
    nextStore = { ...input.store, candidates: mergedCandidates };

    if (input.onCheckpoint && processed % CHECKPOINT_EVERY === 0) {
      await input.onCheckpoint(nextStore);
    }

    if (Date.now() < input.deadlineMs) {
      await sleep(ENRICHMENT_DELAY_MS);
    }
  }

  return {
    store: nextStore,
    candidatesChecked: processed,
    candidatesEnriched,
    candidatesWithoutQuestionnaires,
    apiFailures,
    rateLimitRetries,
  };
}

/** Process every pending June MTD candidate until all have been attempted or deadline is reached. */
export async function completeJuneQuestionnaireEnrichment(input: {
  store: CandidateIngestionStoreFile;
  companyId: string;
  deadlineMs: number;
  reference?: Date;
  onCheckpoint?: (store: CandidateIngestionStoreFile) => Promise<void>;
}): Promise<{
  store: CandidateIngestionStoreFile;
  report: QuestionnaireEnrichmentCompletionReport;
}> {
  const reference = input.reference ?? new Date();
  const mtd = filterMtdCandidates(listIngestedCandidates(input.store), currentMtdDateRange(reference));
  const alreadyEnrichedSkipped = mtd.filter(
    (candidate) => candidate.questionnaireAnswers?.length || candidate.hasQuestionnaire,
  ).length;
  const pendingAtStart = listMtdCandidatesPendingQuestionnaireEnrichment(input.store, reference).length;

  let store = input.store;
  let candidatesEnriched = 0;
  let candidatesWithoutQuestionnaires = 0;
  let apiFailures = 0;
  let rateLimitRetries = 0;
  let candidatesScanned = 0;

  while (Date.now() < input.deadlineMs) {
    const pending = listMtdCandidatesPendingQuestionnaireEnrichment(store, reference);
    if (pending.length === 0) break;

    const batch = await enrichIngestionStoreQuestionnaires({
      store,
      companyId: input.companyId,
      deadlineMs: input.deadlineMs,
      reference,
      maxCandidates: pending.length,
      onCheckpoint: input.onCheckpoint,
    });

    store = batch.store;
    candidatesScanned += batch.candidatesChecked;
    candidatesEnriched += batch.candidatesEnriched;
    candidatesWithoutQuestionnaires += batch.candidatesWithoutQuestionnaires;
    apiFailures += batch.apiFailures;
    rateLimitRetries += batch.rateLimitRetries;

    if (batch.candidatesChecked === 0) break;
  }

  const mtdAfter = filterMtdCandidates(listIngestedCandidates(store), currentMtdDateRange(reference));
  const withQuestionnaire = mtdAfter.filter((candidate) => (candidate.questionnaireAnswers?.length ?? 0) > 0).length;
  const stillPending = listMtdCandidatesPendingQuestionnaireEnrichment(store, reference).length;
  const questionnaireCompletionPct =
    mtdAfter.length > 0 ? Math.round((withQuestionnaire / mtdAfter.length) * 100) : 0;

  return {
    store,
    report: {
      generatedAt: new Date().toISOString(),
      candidatesScanned,
      candidatesEnriched,
      candidatesWithoutQuestionnaires,
      apiFailures,
      rateLimitRetries,
      questionnaireCompletionPct,
      alreadyEnrichedSkipped,
      pendingAtStart,
      stillPending,
    },
  };
}
