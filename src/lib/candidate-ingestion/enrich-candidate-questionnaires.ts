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

const ENRICHMENT_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function candidateNeedsQuestionnaireEnrichment(candidate: BreezyCandidate): boolean {
  return !(candidate.questionnaireAnswers?.length || candidate.hasQuestionnaire);
}

export function listMtdCandidatesMissingQuestionnaire(
  store: CandidateIngestionStoreFile,
  reference = new Date(),
): BreezyCandidate[] {
  return filterMtdCandidates(listIngestedCandidates(store), currentMtdDateRange(reference)).filter(
    (candidate) => candidate.positionId?.trim() && candidateNeedsQuestionnaireEnrichment(candidate),
  );
}

export async function enrichCandidateWithQuestionnaireDetail(input: {
  candidate: BreezyCandidate;
  companyId: string;
}): Promise<{ candidate: BreezyCandidate; enriched: boolean }> {
  const { candidate, companyId } = input;
  if (!candidate.positionId?.trim() || !candidate.candidateId) {
    return { candidate, enriched: false };
  }
  if (!candidateNeedsQuestionnaireEnrichment(candidate)) {
    return { candidate, enriched: false };
  }

  const payloadResult = await fetchBreezyCandidateEnrichmentPayload({
    companyId,
    positionId: candidate.positionId,
    candidateId: candidate.candidateId,
  });
  if (!payloadResult.ok) {
    return { candidate, enriched: false };
  }

  const enrichedCandidate = enrichBreezyCandidateWithQuestionnairePayload(candidate, payloadResult.payload);
  const enriched = Boolean(
    (enrichedCandidate.questionnaireAnswers?.length ?? 0) > (candidate.questionnaireAnswers?.length ?? 0) ||
      enrichedCandidate.hasQuestionnaire,
  );
  return { candidate: enrichedCandidate, enriched };
}

export async function enrichIngestionStoreQuestionnaires(input: {
  store: CandidateIngestionStoreFile;
  companyId: string;
  deadlineMs: number;
  reference?: Date;
  maxCandidates?: number;
}): Promise<{
  store: CandidateIngestionStoreFile;
  candidatesChecked: number;
  candidatesEnriched: number;
}> {
  const candidates = listMtdCandidatesMissingQuestionnaire(input.store, input.reference);
  const limit = input.maxCandidates ?? candidates.length;
  const candidatesToCheck = candidates.slice(0, limit);

  let candidatesEnriched = 0;
  const mergedCandidates = { ...input.store.candidates };

  for (const candidate of candidatesToCheck) {
    if (Date.now() >= input.deadlineMs) break;

    const result = await enrichCandidateWithQuestionnaireDetail({
      candidate,
      companyId: input.companyId,
    });
    mergedCandidates[candidate.candidateId] = mergeCandidateRecord(
      mergedCandidates[candidate.candidateId],
      result.candidate,
    );
    if (result.enriched) candidatesEnriched += 1;

    if (Date.now() < input.deadlineMs) {
      await sleep(ENRICHMENT_DELAY_MS);
    }
  }

  return {
    store: {
      ...input.store,
      candidates: mergedCandidates,
    },
    candidatesChecked: candidatesToCheck.length,
    candidatesEnriched,
  };
}
