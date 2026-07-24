import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import {
  loadP240PriorSentExclusion,
  resolveP240Cutoff,
} from "@/lib/p240-autonomous-new-applicant-pipeline/cohort";
import {
  buildP240BlockedList,
  buildP240LiveDashboard,
  buildP240PipelineHealth,
  buildP240Throughput,
} from "@/lib/p240-autonomous-new-applicant-pipeline/health";
import {
  buildP240EmailOwners,
  buildP240RecruiterProposals,
  selectP240Cohorts,
  simulateP240CandidatePath,
  type P240OppPoint,
} from "@/lib/p240-autonomous-new-applicant-pipeline/simulate";
import {
  P240_EXECUTION_MODE,
  P240_PHASE,
  P240_SCHEMA_VERSION,
  type P240CandidateTrace,
  type P240RunResult,
  type P240ZeroWriteAudit,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";

export async function runP240AutonomousPipelineDryRun(input: {
  workflows: Record<string, CandidateWorkflowRecord>;
  candidates: BreezyCandidate[];
  jobsByPositionId: Map<string, BreezyJob>;
  policy: CandidateOnboardingPolicy;
  rosters: RecruiterRosters;
  opportunityPoints: P240OppPoint[];
  recoveryIds?: Set<string>;
  allowNetworkGeocode?: boolean;
  nowMs?: number;
  cwd?: string;
  zeroWriteAudit: P240ZeroWriteAudit;
  testsRun?: number;
  testsPassed?: number;
  artifactPaths?: string[];
}): Promise<P240RunResult> {
  const generatedAt = new Date().toISOString();
  const cwd = input.cwd ?? process.cwd();
  const cutoff = resolveP240Cutoff(cwd);
  const prior = loadP240PriorSentExclusion(cwd);
  const cohorts = selectP240Cohorts({
    candidates: input.candidates,
    workflows: input.workflows,
    cutoff,
    priorSent: prior.all,
    nowMs: input.nowMs,
  });

  const candidatesById = new Map(input.candidates.map((c) => [c.candidateId, c]));

  // Real new post-cutoff: evaluate current state (no replay).
  const realIds = cohorts.realNewIds;
  // Proxy 24h: replay as fresh new arrivals (labeled simulation).
  const proxyIds = cohorts.proxyIds;

  const allSimIds = [...new Set([...realIds, ...proxyIds])];
  const proposals = buildP240RecruiterProposals({
    workflows: input.workflows,
    candidates: input.candidates,
    rosters: input.rosters,
    candidateIds: allSimIds,
  });
  const emailOwners = buildP240EmailOwners(input.candidates, allSimIds);

  const traces: P240CandidateTrace[] = [];

  for (const candidateId of realIds) {
    const proposal = proposals.get(candidateId) ?? { recruiter: null, confidence: null };
    const candidate = candidatesById.get(candidateId);
    const positionId = String(candidate?.positionId ?? "").trim();
    const job = positionId ? (input.jobsByPositionId.get(positionId) ?? null) : null;
    const trace = await simulateP240CandidatePath({
      candidateId,
      candidate,
      workflow: input.workflows[candidateId],
      job,
      policy: input.policy,
      opportunityPoints: input.opportunityPoints,
      priorSent: prior.all,
      proposedRecruiter: proposal.recruiter,
      recruiterConfidence: proposal.confidence,
      emailOwners,
      cohortKind: "real_new_post_cutoff",
      replayAsFreshNew: false,
      allowNetworkGeocode: input.allowNetworkGeocode,
      inRecoveryStore: input.recoveryIds?.has(candidateId),
    });
    traces.push(trace);
  }

  for (const candidateId of proxyIds) {
    // Avoid duplicate traces when a real-new id is also in the proxy sample.
    if (realIds.includes(candidateId)) continue;
    const proposal = proposals.get(candidateId) ?? { recruiter: null, confidence: null };
    const candidate = candidatesById.get(candidateId);
    const positionId = String(candidate?.positionId ?? "").trim();
    const job = positionId ? (input.jobsByPositionId.get(positionId) ?? null) : null;
    const trace = await simulateP240CandidatePath({
      candidateId,
      candidate,
      workflow: input.workflows[candidateId],
      job,
      policy: input.policy,
      opportunityPoints: input.opportunityPoints,
      priorSent: prior.all,
      proposedRecruiter: proposal.recruiter,
      recruiterConfidence: proposal.confidence,
      emailOwners,
      cohortKind: "simulation_proxy_24h",
      replayAsFreshNew: true,
      allowNetworkGeocode: input.allowNetworkGeocode,
      inRecoveryStore: input.recoveryIds?.has(candidateId),
    });
    traces.push(trace);
  }

  // If real-new set is empty, still ensure proxy cohort is fully labeled/simulated.
  // (Already handled above.) If proxy was empty due to no data, traces may be empty.

  // Prefer including proxy replays even when overlapping real-new: re-sim as proxy for throughput.
  // When real-new overlapped and was skipped in proxy loop, add dedicated proxy replays for throughput.
  const proxyMissing = proxyIds.filter((id) => realIds.includes(id));
  for (const candidateId of proxyMissing) {
    const proposal = proposals.get(candidateId) ?? { recruiter: null, confidence: null };
    const candidate = candidatesById.get(candidateId);
    const positionId = String(candidate?.positionId ?? "").trim();
    const job = positionId ? (input.jobsByPositionId.get(positionId) ?? null) : null;
    const trace = await simulateP240CandidatePath({
      candidateId,
      candidate,
      workflow: input.workflows[candidateId],
      job,
      policy: input.policy,
      opportunityPoints: input.opportunityPoints,
      priorSent: prior.all,
      proposedRecruiter: proposal.recruiter,
      recruiterConfidence: proposal.confidence,
      emailOwners,
      cohortKind: "simulation_proxy_24h",
      replayAsFreshNew: true,
      allowNetworkGeocode: input.allowNetworkGeocode,
      inRecoveryStore: input.recoveryIds?.has(candidateId),
    });
    traces.push(trace);
  }

  const dashboard = buildP240LiveDashboard({
    traces,
    cutoffIso: cutoff.cutoffIso,
    cutoffSource: cutoff.source,
    realNewCount: realIds.length,
    generatedAt,
  });
  const throughput = buildP240Throughput({
    traces,
    arrivalsLast14Days: cohorts.arrivalsLast14Days,
    estimatedDailyArrivalRate: cohorts.estimatedDailyArrivalRate,
    projectedArrivalsNext24h: cohorts.projectedArrivalsNext24h,
    generatedAt,
  });
  const health = buildP240PipelineHealth({
    dashboard,
    throughput,
    traces,
    generatedAt,
  });
  const blocked = buildP240BlockedList(traces);

  return {
    phase: P240_PHASE,
    schemaVersion: P240_SCHEMA_VERSION,
    mode: P240_EXECUTION_MODE,
    generatedAt,
    cutoff,
    dashboard,
    throughput,
    health,
    traces,
    blocked,
    zeroWriteAudit: input.zeroWriteAudit,
    testsRun: input.testsRun ?? 0,
    testsPassed: input.testsPassed ?? 0,
    artifactPaths: input.artifactPaths ?? [],
  };
}
