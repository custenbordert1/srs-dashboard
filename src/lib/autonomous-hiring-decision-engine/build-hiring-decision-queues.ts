import type {
  HiringDecision,
  HiringDecisionQueueId,
  HiringDecisionQueues,
  HiringRecommendationAction,
} from "@/lib/autonomous-hiring-decision-engine/types";

const QUEUE_ORDER: HiringDecisionQueueId[] = [
  "fast_track",
  "recruiter_review",
  "hold",
  "reject",
  "missing_information",
];

function emptyQueues(): HiringDecisionQueues {
  return {
    fast_track: [],
    recruiter_review: [],
    hold: [],
    reject: [],
    missing_information: [],
  };
}

export function buildHiringDecisionQueues(decisions: HiringDecision[]): HiringDecisionQueues {
  const queues = emptyQueues();
  for (const decision of decisions) {
    queues[decision.action].push(decision);
  }
  return queues;
}

export function validateHiringDecisionQueues(decisions: HiringDecision[]): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (decisions.length === 0) return { ok: true, errors };

  const byCandidate = new Map<string, HiringRecommendationAction[]>();
  for (const decision of decisions) {
    const existing = byCandidate.get(decision.candidateId) ?? [];
    existing.push(decision.action);
    byCandidate.set(decision.candidateId, existing);
  }

  for (const [candidateId, actions] of byCandidate) {
    if (actions.length !== 1) {
      errors.push(`Candidate ${candidateId} has ${actions.length} recommendations: ${actions.join(", ")}`);
    }
  }

  const queues = buildHiringDecisionQueues(decisions);
  let queueTotal = 0;
  for (const id of QUEUE_ORDER) {
    queueTotal += queues[id].length;
  }
  if (queueTotal !== decisions.length) {
    errors.push(`Queue total ${queueTotal} does not match decision count ${decisions.length}`);
  }

  const seen = new Set<string>();
  for (const id of QUEUE_ORDER) {
    for (const item of queues[id]) {
      if (seen.has(item.candidateId)) {
        errors.push(`Candidate ${item.candidateId} appears in multiple queues`);
      }
      seen.add(item.candidateId);
    }
  }

  return { ok: errors.length === 0, errors };
}
