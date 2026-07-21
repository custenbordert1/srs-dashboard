import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P240OppPoint } from "@/lib/p240-autonomous-new-applicant-pipeline/simulate";
import {
  loadP241QualificationFailedSeeds,
  resolveP241CandidateContext,
} from "@/lib/p241-p65-qualification-forensics/load-cohort";
import {
  buildP241CandidateForensic,
  buildP241ThroughputSimulation,
  projectP241RecoveryPath,
} from "@/lib/p241-p65-qualification-forensics/simulate";
import {
  P241_EXECUTION_MODE,
  P241_PHASE,
  P241_SCHEMA_VERSION,
  P241_SOURCE_PHASE,
  type P241ForensicsResult,
  type P241ZeroWriteAudit,
} from "@/lib/p241-p65-qualification-forensics/types";

export async function runP241P65QualificationForensics(input: {
  workflows: Record<string, CandidateWorkflowRecord>;
  candidates: BreezyCandidate[];
  jobsByPositionId: Map<string, BreezyJob>;
  policy: CandidateOnboardingPolicy;
  opportunityPoints: P240OppPoint[];
  zeroWriteAudit: P241ZeroWriteAudit;
  cwd?: string;
  allowNetworkGeocode?: boolean;
  /** P240 baseline metrics for throughput projection. */
  baseline: {
    proxyCohortSize: number;
    wouldSendCount: number;
    blockedCount: number;
    autoClearRatePct: number;
    estimatedDailyArrivalRate: number;
    arrivalsLast14Days: number;
    healthScore: number;
    remainingNonQualificationBlockers: Array<{ blocker: string; count: number }>;
  };
  testsRun?: number;
  testsPassed?: number;
  artifactPaths?: string[];
}): Promise<P241ForensicsResult> {
  const generatedAt = new Date().toISOString();
  const seeds = loadP241QualificationFailedSeeds(input.cwd ?? process.cwd());
  const candidatesById = new Map(input.candidates.map((c) => [c.candidateId, c]));

  const forensics = [];
  for (const seed of seeds) {
    const { candidate, workflow } = resolveP241CandidateContext({
      seed,
      candidatesById,
      workflows: input.workflows,
    });
    let forensic = buildP241CandidateForensic({
      seed,
      candidate,
      workflow,
      policy: input.policy,
    });
    if (!candidate) {
      throw new Error(`P241: candidate ${seed.candidateId} missing from ingestion`);
    }
    const positionId = String(candidate.positionId ?? "").trim();
    const job = positionId ? (input.jobsByPositionId.get(positionId) ?? null) : null;
    forensic = await projectP241RecoveryPath({
      forensic,
      candidate,
      workflow,
      job,
      policy: input.policy,
      opportunityPoints: input.opportunityPoints,
      allowNetworkGeocode: input.allowNetworkGeocode,
    });
    forensics.push(forensic);
  }

  const byFailedCheckId: Record<string, number> = {};
  const byRuleCategory: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  const byRecoverability: Record<string, number> = {};
  for (const f of forensics) {
    byFailedCheckId[f.failedCheckId] = (byFailedCheckId[f.failedCheckId] ?? 0) + 1;
    byRuleCategory[f.failedRule] = (byRuleCategory[f.failedRule] ?? 0) + 1;
    byClassification[f.classification] = (byClassification[f.classification] ?? 0) + 1;
    byRecoverability[f.recoverability] = (byRecoverability[f.recoverability] ?? 0) + 1;
  }

  const throughputSimulation = buildP241ThroughputSimulation({
    forensics,
    baselineWouldSend: input.baseline.wouldSendCount,
    baselineBlocked: input.baseline.blockedCount,
    proxyCohortSize: input.baseline.proxyCohortSize,
    estimatedDailyArrivalRate: input.baseline.estimatedDailyArrivalRate,
    arrivalsLast14Days: input.baseline.arrivalsLast14Days,
    baselineHealthScore: input.baseline.healthScore,
    baselineAutoClearRatePct: input.baseline.autoClearRatePct,
    remainingNonQualificationBlockers: input.baseline.remainingNonQualificationBlockers,
    generatedAt,
  });

  return {
    phase: P241_PHASE,
    schemaVersion: P241_SCHEMA_VERSION,
    mode: P241_EXECUTION_MODE,
    generatedAt,
    sourcePhase: P241_SOURCE_PHASE,
    qualificationGateFailedCount: forensics.length,
    candidates: forensics,
    ruleTraceSummary: {
      byFailedCheckId,
      byRuleCategory,
      byClassification,
      byRecoverability,
    },
    recoveryOpportunities: forensics.map((c) => ({
      redactedCandidateId: c.redactedCandidateId,
      displayName: c.displayName,
      recoverability: c.recoverability,
      classification: c.classification,
      correction: c.smallestSafeCorrection,
      unlocksWouldSend: c.projectedOutcomeIfRecovered === "would_send",
    })),
    throughputSimulation,
    zeroWriteAudit: input.zeroWriteAudit,
    testsRun: input.testsRun ?? 0,
    testsPassed: input.testsPassed ?? 0,
    artifactPaths: input.artifactPaths ?? [],
  };
}
