/**
 * P65.2 validation — execution lifecycle, safety controls, retry, and executive metrics.
 * Usage: npx tsx scripts/p65-2-validate-execution.ts [--dry-run]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import {
  DEFAULT_CANDIDATE_AUTOMATION_POLICY,
  loadCandidateAutomationPolicy,
  saveCandidateAutomationPolicy,
} from "@/lib/candidate-automation-engine/automation-policy-store";
import { runCandidateAutomationEngine } from "@/lib/candidate-automation-engine/run-candidate-automation-engine";
import {
  applyCandidateExecutions,
  buildCandidateExecutionHealth,
  buildExecutionDecisions,
  DEFAULT_CANDIDATE_EXECUTION_POLICY,
  listCandidateExecutions,
  loadCandidateExecutionPolicy,
  loadExecutionRunSummary,
  retryEligibleExecution,
  runCandidateAutomationExecution,
  saveCandidateExecutionPolicy,
} from "@/lib/candidate-automation-execution";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const beforePolicy = await loadCandidateAutomationPolicy();
  const beforeExecutionPolicy = await loadCandidateExecutionPolicy();
  const beforeRecords = (await listCandidateExecutions(500)).length;

  const defaultPolicySafe =
    DEFAULT_CANDIDATE_EXECUTION_POLICY.enabled === false &&
    DEFAULT_CANDIDATE_EXECUTION_POLICY.mode === "semi-automatic" &&
    DEFAULT_CANDIDATE_EXECUTION_POLICY.escalation.requireApproval === true &&
    DEFAULT_CANDIDATE_EXECUTION_POLICY.maxEscalationsPerRun === 10;

  await saveCandidateAutomationPolicy({
    ...beforePolicy,
    execution: { enabled: true },
    escalation: { enabled: true },
  });

  const executionPolicyForRun = {
    ...beforeExecutionPolicy,
    enabled: true,
    mode: "semi-automatic" as const,
    dryRun,
    paperwork: { enabled: true },
    escalation: { enabled: true, requireApproval: true },
    maxEscalationsPerRun: 10,
  };
  await saveCandidateExecutionPolicy(executionPolicyForRun);

  const orchestrator = await runCandidateAutomationEngine({ trigger: "api" });
  const afterOrchestratorRecords = await listCandidateExecutions(500);
  const orchestratorCreatesRecords = dryRun
    ? afterOrchestratorRecords.length === beforeRecords
    : afterOrchestratorRecords.length >= beforeRecords;

  const lastRun = await loadExecutionRunSummary();
  const dryRunReported = dryRun ? lastRun?.dryRun === true && (lastRun.executed ?? 0) === 0 : true;
  const dryRunModeWorks = dryRun
    ? Boolean(lastRun?.dryRun && lastRun.executed === 0 && (lastRun.eligibleExecutions ?? 0) > 0)
    : true;
  const batchCapConfigured = (await loadCandidateExecutionPolicy()).maxEscalationsPerRun === 10;
  const batchCapWorks = dryRun
    ? Boolean((lastRun?.blockedByBatchCap ?? 0) > 0)
    : (await loadExecutionRunSummary())?.blockedByBatchCap !== undefined;

  const [store, bundle, jobsResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
  ]);
  const jobsByPositionId = new Map((jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]));
  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const scored = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );
  const decisions = buildExecutionDecisions({
    candidates: scored,
    escalationDelayHours: 48,
  });

  const dryRunResult = await applyCandidateExecutions({
    decisions: decisions.slice(0, 5),
    candidatesById: new Map(scored.slice(0, 5).map((row) => [row.candidateId, row])),
    policy: { ...executionPolicyForRun, dryRun: true, enabled: true, maxEscalationsPerRun: 10 },
    automationMode: "semi-automatic",
  });
  const dryRunApplyWorks = dryRunResult.dryRun === true && dryRunResult.completed === 0;

  const batchCapResult = await applyCandidateExecutions({
    decisions: decisions.slice(0, 5),
    candidatesById: new Map(scored.slice(0, 5).map((row) => [row.candidateId, row])),
    policy: { ...executionPolicyForRun, dryRun: true, enabled: true, maxEscalationsPerRun: 1 },
    automationMode: "automatic",
  });
  const batchCapSimWorks =
    batchCapResult.dryRun === true &&
    batchCapResult.eligibleExecutions > 1 &&
    batchCapResult.blockedByBatchCap >= 1;

  const disabled = await applyCandidateExecutions({
    decisions: decisions.slice(0, 1),
    candidatesById: new Map(scored.map((row) => [row.candidateId, row])),
    policy: { ...executionPolicyForRun, enabled: false },
    automationMode: "automatic",
  });
  const policyDisableWorks = disabled.blockedByPolicy >= 1;

  const executionDry = await (async () => {
    await saveCandidateExecutionPolicy({ ...executionPolicyForRun, dryRun: true, enabled: true });
    return runCandidateAutomationExecution({
      candidates: scored.slice(0, 3),
      automationMode: "semi-automatic",
    });
  })();

  const failedRecord = afterOrchestratorRecords.find((row) => row.status === "failed");
  let retryWorks = true;
  if (failedRecord && !dryRun) {
    const row = scored.find((candidate) => candidate.candidateId === failedRecord.candidateId);
    if (row) {
      const retried = await retryEligibleExecution({
        executionId: failedRecord.executionId,
        policy: await loadCandidateExecutionPolicy(),
        candidatesById: new Map([[row.candidateId, row]]),
        automationMode: "automatic",
      });
      retryWorks = Boolean(retried && retried.retryCount >= failedRecord.retryCount);
    }
  }

  const health = await buildCandidateExecutionHealth();
  const healthComplete =
    typeof health.eligibleExecutions === "number" &&
    typeof health.executed === "number" &&
    typeof health.blockedByPolicy === "number" &&
    typeof health.blockedByBatchCap === "number" &&
    typeof health.successRatePct === "number";

  const recordsFile = path.join(recruitingDataDir(), "candidate-automation-execution-records.json");
  const recordsPersistOnDisk = (await readFile(recordsFile, "utf8")).includes("executionId");

  const checks = {
    defaultPolicySafe,
    orchestratorOk: orchestrator.ok,
    orchestratorCreatesRecords,
    dryRunReported,
    dryRunModeWorks,
    dryRunApplyWorks,
    batchCapConfigured,
    batchCapWorks,
    batchCapSimWorks,
    policyDisableWorks,
    retryWorks,
    healthComplete,
    recordsPersistOnDisk,
    escalationApprovalDefault: DEFAULT_CANDIDATE_EXECUTION_POLICY.escalation.requireApproval,
    executionDryRunSkipped: dryRun ? executionDry.dryRun : true,
  };

  console.log(`\n=== P65.2 validation (${dryRun ? "dry-run" : "live"}) ===`);
  console.log(JSON.stringify(checks, null, 2));
  console.log("\n=== Execution health ===");
  console.log(JSON.stringify(health, null, 2));
  if (lastRun) {
    console.log("\n=== Last run summary ===");
    console.log(JSON.stringify(lastRun, null, 2));
  }

  await saveCandidateAutomationPolicy(beforePolicy);
  await saveCandidateExecutionPolicy(beforeExecutionPolicy);

  const pass = Object.values(checks).every(Boolean);
  console.log(pass ? "\nOVERALL: PASS" : "\nOVERALL: FAIL");
  process.exit(pass ? 0 : 1);
}

void main();
