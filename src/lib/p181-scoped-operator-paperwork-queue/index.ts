import { defaultOperatorLiveCycleScope } from "@/lib/p181-scoped-operator-paperwork-queue/resolve-operator-scope-pool";
import type {
  OperatorSendQueueCohort,
  OperatorSendQueueScope,
  PaperworkSendQueueInput,
  PaperworkSendQueueSummary,
  P181ScopedQueueValidationReport,
  SendQueueProfile,
} from "@/lib/p181-scoped-operator-paperwork-queue/types";

export type {
  OperatorSendQueueCohort,
  OperatorSendQueueScope,
  PaperworkSendQueueInput,
  PaperworkSendQueueSummary,
  P181ScopedQueueValidationReport,
  SendQueueProfile,
};
export { P181_SOURCE_PHASE } from "@/lib/p181-scoped-operator-paperwork-queue/types";
export {
  defaultOperatorLiveCycleScope,
  resolveOperatorScopePool,
} from "@/lib/p181-scoped-operator-paperwork-queue/resolve-operator-scope-pool";
export { resolveP178ReadyCandidateIds } from "@/lib/p181-scoped-operator-paperwork-queue/resolve-p178-ready-candidate-ids";
export {
  resolvePaperworkSendQueue,
  sortSendQueueCandidateRows,
} from "@/lib/p181-scoped-operator-paperwork-queue/select-send-queue-candidates";
export { buildP181ScopedQueueValidationReport } from "@/lib/p181-scoped-operator-paperwork-queue/build-scoped-queue-validation";
export { formatP181Markdown } from "@/lib/p181-scoped-operator-paperwork-queue/format-report";

export function resolveSendQueueForGateProfile(input: {
  gateProfile: "operator" | "autonomous";
  candidateIds?: string[];
  sendQueueScope?: OperatorSendQueueScope;
}): PaperworkSendQueueInput {
  if (input.gateProfile === "autonomous") {
    return { profile: "autonomous" };
  }

  if (input.candidateIds && input.candidateIds.length > 0) {
    return {
      profile: "operator",
      scope: { candidateIds: input.candidateIds, cohort: "explicit" },
    };
  }

  if (input.sendQueueScope) {
    return { profile: "operator", scope: input.sendQueueScope };
  }

  return {
    profile: "operator",
    scope: defaultOperatorLiveCycleScope(),
  };
}
