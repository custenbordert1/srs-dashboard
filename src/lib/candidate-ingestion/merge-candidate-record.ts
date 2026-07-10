import type { BreezyCandidate } from "@/lib/breezy-api";

export function mergeIngestionSource(
  existing?: BreezyCandidate["ingestionSource"],
  incoming?: BreezyCandidate["ingestionSource"],
): BreezyCandidate["ingestionSource"] | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (existing === incoming) return existing;
  return "merged";
}

export function mergeCandidateRecord(
  existing: BreezyCandidate | undefined,
  incoming: BreezyCandidate,
): BreezyCandidate {
  if (!existing) return incoming;

  const incomingQuestionnaireCount = incoming.questionnaireAnswers?.length ?? 0;
  const existingQuestionnaireCount = existing.questionnaireAnswers?.length ?? 0;
  const questionnaireAnswers =
    incomingQuestionnaireCount >= existingQuestionnaireCount
      ? incoming.questionnaireAnswers
      : existing.questionnaireAnswers;

  const incomingResumeLength = incoming.resumeText?.trim().length ?? 0;
  const existingResumeLength = existing.resumeText?.trim().length ?? 0;

  return {
    ...existing,
    ...incoming,
    ingestionSource: mergeIngestionSource(existing.ingestionSource, incoming.ingestionSource),
    breezyCandidateIdUnavailable:
      existing.breezyCandidateIdUnavailable === false
        ? false
        : incoming.breezyCandidateIdUnavailable ?? existing.breezyCandidateIdUnavailable,
    questionnaireAnswers,
    hasQuestionnaire: Boolean(questionnaireAnswers?.length) || existing.hasQuestionnaire || incoming.hasQuestionnaire,
    questionnaireEnrichmentAttemptedAt:
      incoming.questionnaireEnrichmentAttemptedAt ?? existing.questionnaireEnrichmentAttemptedAt,
    resumeText: incomingResumeLength >= existingResumeLength ? incoming.resumeText : existing.resumeText,
    hasResume: existing.hasResume || incoming.hasResume,
    resumeFields: incoming.resumeFields ?? existing.resumeFields,
    resumeAssets:
      (incoming.resumeAssets?.length ?? 0) >= (existing.resumeAssets?.length ?? 0)
        ? incoming.resumeAssets
        : existing.resumeAssets,
  };
}
