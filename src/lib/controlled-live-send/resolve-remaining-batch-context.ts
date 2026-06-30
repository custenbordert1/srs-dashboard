import {
  P100_CONFIRMATION_PHRASE,
  P100_EXPECTED_CANDIDATE_COUNT,
  P100_REMAINING_BATCH_PHRASE,
} from "@/lib/controlled-live-send/types";

export type RemainingBatchContext = {
  batchMode: "full_cohort" | "remaining_cohort";
  requiredConfirmationPhrase: string;
  requiredCandidateCount: number;
  alreadySentCount: number;
  excludedCandidateIds: string[];
  detail: string;
};

export function resolveRemainingBatchContext(input: {
  readyToSend: number;
  alreadySentCount: number;
  sentCandidateIds: string[];
  totalCandidates?: number;
}): RemainingBatchContext {
  const total = input.totalCandidates ?? P100_EXPECTED_CANDIDATE_COUNT;

  if (input.alreadySentCount > 0) {
    return {
      batchMode: "remaining_cohort",
      requiredConfirmationPhrase: P100_REMAINING_BATCH_PHRASE,
      requiredCandidateCount: input.readyToSend,
      alreadySentCount: input.alreadySentCount,
      excludedCandidateIds: [...input.sentCandidateIds],
      detail: `${input.alreadySentCount} already sent — batch locked to remaining ${input.readyToSend} with phrase "${P100_REMAINING_BATCH_PHRASE}".`,
    };
  }

  return {
    batchMode: "full_cohort",
    requiredConfirmationPhrase: P100_CONFIRMATION_PHRASE,
    requiredCandidateCount: total,
    alreadySentCount: 0,
    excludedCandidateIds: [],
    detail: `No sends yet — full cohort batch uses phrase "${P100_CONFIRMATION_PHRASE}" and count ${total}.`,
  };
}

export function isValidBatchConfirmation(input: {
  confirmationPhrase?: string;
  candidateCount?: number;
  readyToSend: number;
  alreadySentCount: number;
  sentCandidateIds: string[];
  totalCandidates?: number;
}): boolean {
  const ctx = resolveRemainingBatchContext({
    readyToSend: input.readyToSend,
    alreadySentCount: input.alreadySentCount,
    sentCandidateIds: input.sentCandidateIds,
    totalCandidates: input.totalCandidates,
  });
  return (
    input.confirmationPhrase?.trim() === ctx.requiredConfirmationPhrase &&
    input.candidateCount === ctx.requiredCandidateCount &&
    input.readyToSend === ctx.requiredCandidateCount
  );
}
