import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { resolveOperatorScopePool } from "@/lib/p181-scoped-operator-paperwork-queue/resolve-operator-scope-pool";
import type {
  OperatorSendQueueScope,
  PaperworkSendQueueInput,
  PaperworkSendQueueSummary,
  SendQueueProfile,
} from "@/lib/p181-scoped-operator-paperwork-queue/types";
import type { ImmediatePaperworkCandidateRow } from "@/lib/p152-immediate-paperwork-policy/types";

export async function resolvePaperworkSendQueue(input: {
  sendQueue?: PaperworkSendQueueInput;
  allCandidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
}): Promise<{
  profile: SendQueueProfile;
  scope?: OperatorSendQueueScope;
  candidates: BreezyCandidate[];
  summary: PaperworkSendQueueSummary;
}> {
  const profile = input.sendQueue?.profile ?? "autonomous";
  const scope = input.sendQueue?.scope;

  if (profile === "autonomous") {
    return {
      profile,
      scope,
      candidates: input.allCandidates,
      summary: {
        profile,
        scope,
        globalCandidateCount: input.allCandidates.length,
        scopedCandidateCount: input.allCandidates.length,
        operatorScopedOnly: false,
      },
    };
  }

  const scopedCandidates = await resolveOperatorScopePool({
    scope,
    allCandidates: input.allCandidates,
    workflows: input.workflows,
    jobsByPositionId: input.jobsByPositionId,
  });

  return {
    profile,
    scope,
    candidates: scopedCandidates,
    summary: {
      profile,
      scope,
      globalCandidateCount: input.allCandidates.length,
      scopedCandidateCount: scopedCandidates.length,
      operatorScopedOnly: true,
    },
  };
}

export function sortSendQueueCandidateRows(input: {
  profile: SendQueueProfile;
  scope?: OperatorSendQueueScope;
  rows: ImmediatePaperworkCandidateRow[];
}): ImmediatePaperworkCandidateRow[] {
  if (input.profile === "autonomous") {
    return [...input.rows].sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.candidateName.localeCompare(b.candidateName);
    });
  }

  if (input.scope?.candidateIds?.length) {
    const order = new Map(input.scope.candidateIds.map((candidateId, index) => [candidateId, index]));
    return [...input.rows].sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return (order.get(a.candidateId) ?? 9999) - (order.get(b.candidateId) ?? 9999);
    });
  }

  return [...input.rows].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.candidateName.localeCompare(b.candidateName);
  });
}
