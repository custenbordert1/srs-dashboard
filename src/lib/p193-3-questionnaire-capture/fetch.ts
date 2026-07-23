import {
  fetchBreezyCandidateEnrichmentPayload,
  resolveBreezyCompany,
  type BreezyCandidate,
} from "@/lib/breezy-api";
import { buildP1933QuestionnaireRecord } from "@/lib/p193-3-questionnaire-capture/normalize";
import type { P1933QuestionnaireRecord } from "@/lib/p193-3-questionnaire-capture/types";
import {
  P193_3_CONCURRENCY,
  P193_3_MAX_RETRIES,
  P193_3_REQUEST_DELAY_MS,
} from "@/lib/p193-3-questionnaire-capture/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(error: string | undefined): boolean {
  return Boolean(error?.toLowerCase().includes("rate limit"));
}

export type P1933FetchResult =
  | {
      ok: true;
      candidateId: string;
      record: P1933QuestionnaireRecord;
      questionnaireCount: number;
    }
  | {
      ok: false;
      candidateId: string;
      error: string;
      unavailable: boolean;
    };

export async function fetchCandidateQuestionnaire(input: {
  candidate: Pick<BreezyCandidate, "candidateId" | "positionId">;
  companyId: string;
  delayMs?: number;
}): Promise<P1933FetchResult> {
  const { candidate, companyId } = input;
  if (!candidate.positionId?.trim()) {
    return {
      ok: false,
      candidateId: candidate.candidateId,
      error: "missing_position_id",
      unavailable: false,
    };
  }

  let lastError = "unknown";
  for (let attempt = 0; attempt < P193_3_MAX_RETRIES; attempt += 1) {
    const payload = await fetchBreezyCandidateEnrichmentPayload({
      companyId,
      positionId: candidate.positionId,
      candidateId: candidate.candidateId,
    });

    if (payload.ok) {
      const questionnaires = payload.payload.questionnaires;
      const questionnaireCount = Array.isArray(questionnaires) ? questionnaires.length : 0;
      const record = buildP1933QuestionnaireRecord({
        candidateId: candidate.candidateId,
        positionId: candidate.positionId,
        payload: payload.payload,
      });
      if (input.delayMs !== 0) await sleep(input.delayMs ?? P193_3_REQUEST_DELAY_MS);
      return {
        ok: true,
        candidateId: candidate.candidateId,
        record,
        questionnaireCount,
      };
    }

    lastError = payload.error;
    if (isRateLimit(payload.error)) {
      await sleep(P193_3_REQUEST_DELAY_MS * (attempt + 2) * 2);
      continue;
    }
    await sleep(P193_3_REQUEST_DELAY_MS * (attempt + 1));
  }

  return {
    ok: false,
    candidateId: candidate.candidateId,
    error: lastError,
    unavailable: true,
  };
}

/** Bounded-concurrency map over candidates. Default concurrency protects P192. */
export async function fetchQuestionnairesBounded(input: {
  candidates: Array<Pick<BreezyCandidate, "candidateId" | "positionId">>;
  companyId?: string;
  concurrency?: number;
  onEach?: (result: P1933FetchResult, index: number) => Promise<void> | void;
  shouldStop?: () => boolean;
}): Promise<P1933FetchResult[]> {
  const company =
    input.companyId != null
      ? { ok: true as const, companyId: input.companyId }
      : await resolveBreezyCompany();
  if (!company.ok || !("companyId" in company) || !company.companyId) {
    return input.candidates.map((c) => ({
      ok: false as const,
      candidateId: c.candidateId,
      error: "company_resolve_failed",
      unavailable: true,
    }));
  }
  const companyId = company.companyId;

  const concurrency = Math.max(1, input.concurrency ?? P193_3_CONCURRENCY);
  const results: P1933FetchResult[] = new Array(input.candidates.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (input.shouldStop?.()) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= input.candidates.length) return;
      const candidate = input.candidates[index]!;
      const result = await fetchCandidateQuestionnaire({
        candidate,
        companyId,
      });
      results[index] = result;
      await input.onEach?.(result, index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
