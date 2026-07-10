import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { resolveP178ReadyCandidateIds } from "@/lib/p181-scoped-operator-paperwork-queue/resolve-p178-ready-candidate-ids";
import type { OperatorSendQueueScope } from "@/lib/p181-scoped-operator-paperwork-queue/types";

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function matchesAnyToken(value: string, tokens: string[]): boolean {
  const normalized = normalizeToken(value);
  return tokens.some((token) => normalizeToken(token) === normalized);
}

function sortByNewestApplicants(candidates: BreezyCandidate[]): BreezyCandidate[] {
  return [...candidates].sort((a, b) =>
    (b.appliedDate || b.addedDate).localeCompare(a.appliedDate || a.addedDate),
  );
}

function applyScopeFilters(input: {
  pool: BreezyCandidate[];
  scope: OperatorSendQueueScope;
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
}): BreezyCandidate[] {
  let pool = input.pool;

  if (input.scope.recruiters?.length) {
    pool = pool.filter((candidate) => {
      const workflow = input.workflows[candidate.candidateId];
      const recruiter = workflow?.assignedRecruiter?.trim() || "Unassigned";
      return matchesAnyToken(recruiter, input.scope.recruiters!);
    });
  }

  if (input.scope.assignedDMs?.length) {
    pool = pool.filter((candidate) => {
      const workflow = input.workflows[candidate.candidateId];
      const row = buildScoredWorkflowRow(candidate, workflow, {
        job: input.jobsByPositionId.get(candidate.positionId ?? ""),
      });
      const dm = row.assignedDM?.trim() || row.suggestedDM?.trim() || "Unassigned";
      return matchesAnyToken(dm, input.scope.assignedDMs!);
    });
  }

  if (input.scope.projects?.length) {
    pool = pool.filter((candidate) => {
      const job = input.jobsByPositionId.get(candidate.positionId ?? "");
      const project = job?.name?.trim() || candidate.positionName?.trim() || "";
      return input.scope.projects!.some((projectFilter) =>
        normalizeToken(project).includes(normalizeToken(projectFilter)),
      );
    });
  }

  if (input.scope.states?.length) {
    pool = pool.filter((candidate) => {
      const state = candidate.state?.trim() || "";
      return matchesAnyToken(state, input.scope.states!);
    });
  }

  return pool;
}

/**
 * Resolves the operator-approved candidate pool. Never expands beyond explicit scope.
 * Precedence: explicit `candidateIds` > cohort narrowing > optional filters.
 */
export async function resolveOperatorScopePool(input: {
  scope?: OperatorSendQueueScope;
  allCandidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
}): Promise<BreezyCandidate[]> {
  const scope = input.scope ?? {};
  const byId = new Map(input.allCandidates.map((candidate) => [candidate.candidateId, candidate]));

  if (scope.candidateIds && scope.candidateIds.length > 0) {
    return scope.candidateIds
      .map((candidateId) => byId.get(candidateId))
      .filter((candidate): candidate is BreezyCandidate => candidate !== undefined);
  }

  let pool = [...input.allCandidates];

  if (scope.newestApplicants && scope.cohort !== "newest_applicants") {
    pool = sortByNewestApplicants(pool).slice(0, scope.newestApplicants);
  }

  if (scope.cohort === "p178_ready") {
    const readyIds = new Set(
      await resolveP178ReadyCandidateIds({
        candidates: pool,
        workflows: input.workflows,
      }),
    );
    pool = pool.filter((candidate) => readyIds.has(candidate.candidateId));
  } else if (scope.cohort === "newest_applicants" || scope.newestApplicants) {
    const limit = scope.newestApplicants ?? 25;
    pool = sortByNewestApplicants(pool).slice(0, limit);
  } else if (scope.cohort === "manual_selection" || scope.cohort === "explicit") {
    return [];
  }

  return applyScopeFilters({
    pool,
    scope,
    workflows: input.workflows,
    jobsByPositionId: input.jobsByPositionId,
  });
}

export function defaultOperatorLiveCycleScope(): OperatorSendQueueScope {
  return {
    cohort: "p178_ready",
    newestApplicants: 25,
  };
}
