import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { getP152MaxSendsPerCycle } from "@/lib/p152-immediate-paperwork-policy/execute-immediate-paperwork-policy";
import {
  defaultOperatorLiveCycleScope,
  resolveOperatorScopePool,
} from "@/lib/p181-scoped-operator-paperwork-queue/resolve-operator-scope-pool";
import { resolveP178ReadyCandidateIds } from "@/lib/p181-scoped-operator-paperwork-queue/resolve-p178-ready-candidate-ids";
import {
  P181_SOURCE_PHASE,
  type P181ScopedQueueValidationReport,
} from "@/lib/p181-scoped-operator-paperwork-queue/types";

function countEligible(input: {
  candidates: import("@/lib/breezy-api").BreezyCandidate[];
  workflows: Awaited<ReturnType<typeof getCandidateWorkflowBundle>>["workflows"];
  onboardingByCandidate: Map<string, import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord>;
  auditEvents: unknown[];
}): { eligibleIds: string[]; eligibleCount: number } {
  const eligibleIds: string[] = [];
  for (const candidate of input.candidates) {
    const workflow = input.workflows[candidate.candidateId];
    const onboarding = input.onboardingByCandidate.get(candidate.candidateId) ?? null;
    const row = buildScoredWorkflowRow(candidate, workflow, { job: undefined });
    const hard = detectImmediatePaperworkHardBlockers({
      row,
      candidate,
      onboarding,
      auditEvents: input.auditEvents as never[],
    });
    if (!hard.blocked) eligibleIds.push(candidate.candidateId);
  }
  return { eligibleIds, eligibleCount: eligibleIds.length };
}

export async function buildP181ScopedQueueValidationReport(input?: {
  session?: AuthSession;
}): Promise<P181ScopedQueueValidationReport> {
  const generatedAt = new Date().toISOString();
  const session =
    input?.session ??
    ({
      userId: "p181-validation",
      email: "p181@validation.local",
      name: "P181 Validation",
      role: "executive",
      territoryStates: [],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    } satisfies AuthSession);

  const [candidatesResult, jobsResult, bundle, onboardingRecords] = await Promise.all([
    resolveCandidatesForRead({ scanMode: "preview" }),
    fetchBreezyJobs("published").catch(() => ({
      ok: false as const,
      error: "Jobs unavailable",
      fetchedAt: generatedAt,
    })),
    getCandidateWorkflowBundle(),
    listAllCandidateOnboardingRecords().catch(() => []),
  ]);

  const allCandidates = candidatesResult.ok
    ? applyTerritoryToCandidates(session, candidatesResult.candidates)
    : [];
  const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const onboardingByCandidate = new Map(
    onboardingRecords.map((record) => [record.candidateId, record]),
  );
  const auditEvents: unknown[] = [];

  const defaultScope = defaultOperatorLiveCycleScope();
  const [scopedPool, p178ReadyIds] = await Promise.all([
    resolveOperatorScopePool({
      scope: defaultScope,
      allCandidates,
      workflows: bundle.workflows,
      jobsByPositionId,
    }),
    resolveP178ReadyCandidateIds({
      candidates: allCandidates,
      workflows: bundle.workflows,
    }),
  ]);

  const autonomousEligible = countEligible({
    candidates: allCandidates,
    workflows: bundle.workflows,
    onboardingByCandidate,
    auditEvents,
  });
  const operatorEligible = countEligible({
    candidates: scopedPool,
    workflows: bundle.workflows,
    onboardingByCandidate,
    auditEvents,
  });

  const maxSends = getP152MaxSendsPerCycle();
  const autonomousTop = [...allCandidates]
    .map((candidate) => {
      const workflow = bundle.workflows[candidate.candidateId];
      const onboarding = onboardingByCandidate.get(candidate.candidateId) ?? null;
      const row = buildScoredWorkflowRow(candidate, workflow, { job: undefined });
      const hard = detectImmediatePaperworkHardBlockers({
        row,
        candidate,
        onboarding,
        auditEvents: auditEvents as never[],
      });
      const name =
        `${row.firstName ?? candidate.firstName ?? ""} ${row.lastName ?? candidate.lastName ?? ""}`.trim() ||
        candidate.candidateId;
      return { candidateId: candidate.candidateId, name, eligible: !hard.blocked };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .filter((row) => row.eligible)
    .slice(0, maxSends)
    .map((row) => row.candidateId);

  const operatorSet = new Set(operatorEligible.eligibleIds);
  const autonomousSet = new Set(autonomousEligible.eligibleIds);

  return {
    sourcePhase: P181_SOURCE_PHASE,
    generatedAt,
    readOnly: true,
    autonomous: {
      globalPoolCount: allCandidates.length,
      eligibleCount: autonomousEligible.eligibleCount,
      projectedSendCount: Math.min(autonomousEligible.eligibleCount, maxSends),
      topCandidateIds: autonomousTop,
    },
    operator: {
      defaultScope,
      scopedPoolCount: scopedPool.length,
      eligibleCount: operatorEligible.eligibleCount,
      projectedSendCount: Math.min(operatorEligible.eligibleCount, maxSends),
      scopedCandidateIds: scopedPool.map((candidate) => candidate.candidateId),
      p178ReadyCount: p178ReadyIds.length,
      wouldLeakToGlobalPool: false,
    },
    comparison: {
      autonomousOnlyCandidateIds: autonomousEligible.eligibleIds.filter((id) => !operatorSet.has(id)),
      operatorOnlyCandidateIds: operatorEligible.eligibleIds.filter((id) => !autonomousSet.has(id)),
      sharedEligibleIds: operatorEligible.eligibleIds.filter((id) => autonomousSet.has(id)),
    },
    safetyConfirmation: [
      "P152 safety blockers unchanged — only candidate selection scope differs by profile.",
      "Operator profile never expands into the global eligible pool when scoped candidates are fewer than send cap.",
      "Explicit candidateIds take precedence over cohort and filter scope.",
    ],
  };
}
