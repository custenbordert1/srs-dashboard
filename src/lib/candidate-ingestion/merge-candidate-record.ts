import type { BreezyCandidate } from "@/lib/breezy-api";
import { scrubDemoOwnershipSignals } from "@/lib/p203-2-demo-recruiter-ownership-cleanup/prevent";

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

  const incomingZip = (incoming.zipCode ?? "").trim();
  const existingZip = (existing.zipCode ?? "").trim();

  return {
    ...existing,
    ...incoming,
    // P200.2 — never wipe a known ZIP with empty CSV/export/list placeholders.
    zipCode: incomingZip || existingZip || "",
    ingestionSource: mergeIngestionSource(existing.ingestionSource, incoming.ingestionSource),
    breezyCandidateIdUnavailable:
      existing.breezyCandidateIdUnavailable === false
        ? false
        : incoming.breezyCandidateIdUnavailable ?? existing.breezyCandidateIdUnavailable,
    ownershipSignals:
      scrubDemoOwnershipSignals(
        incoming.ownershipSignals?.preferredName
          ? incoming.ownershipSignals
          : existing.ownershipSignals ?? incoming.ownershipSignals,
      ) ?? undefined,
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
