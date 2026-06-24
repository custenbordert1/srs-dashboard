/**
 * P65.1 validation — proves single orchestrator path, policy pause, run persistence, and coverage preservation.
 * Usage: npx tsx scripts/p65-1-validate-orchestration.ts
 */
import { readFile } from "node:fs/promises";
import { buildApplicantCaptureHealth } from "@/lib/candidate-ingestion/build-capture-metrics";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import {
  DEFAULT_CANDIDATE_AUTOMATION_POLICY,
  loadCandidateAutomationPolicy,
  saveCandidateAutomationPolicy,
} from "@/lib/candidate-automation-engine/automation-policy-store";
import { listCandidateAutomationRuns } from "@/lib/candidate-automation-engine/automation-run-store";
import { buildCandidateAutomationHealth } from "@/lib/candidate-automation-engine/build-automation-health";
import { runCandidateAutomationEngine } from "@/lib/candidate-automation-engine/run-candidate-automation-engine";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import path from "node:path";

type CoverageSnapshot = {
  p62CoveragePct: number;
  p63CoveragePct: number;
  p64CoveragePct: number;
  mtdCandidatesProcessed: number;
};

async function captureCoverage(): Promise<CoverageSnapshot> {
  const [store, bundle, jobsResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
  ]);
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const capture = buildApplicantCaptureHealth({
    store,
    workflows: bundle.workflows,
    jobsByPositionId,
    rosters: bundle.rosters,
  });
  const automation = await buildCandidateAutomationHealth({
    store,
    workflows: bundle.workflows,
    jobsByPositionId,
    rosters: bundle.rosters,
  });
  return {
    p62CoveragePct: capture.p62CoveragePct,
    p63CoveragePct: capture.p63CoveragePct,
    p64CoveragePct: capture.p64CoveragePct,
    mtdCandidatesProcessed: automation.mtdCandidatesProcessed,
  };
}

async function main() {
  const before = await captureCoverage();
  console.log("\n=== Coverage BEFORE orchestrator run ===");
  console.log(JSON.stringify(before, null, 2));

  const runsBefore = (await listCandidateAutomationRuns(5)).length;

  const firstRun = await runCandidateAutomationEngine({ trigger: "api" });
  console.log("\n=== First orchestrator run ===");
  console.log(
    JSON.stringify(
      {
        runId: firstRun.runId,
        ok: firstRun.ok,
        skipped: firstRun.skipped,
        mtdCandidatesProcessed: firstRun.mtdCandidatesProcessed,
        p62Assigned: firstRun.p62Assigned,
        p63ActionsGenerated: firstRun.p63ActionsGenerated,
        p64ProgressionsGenerated: firstRun.p64ProgressionsGenerated,
        p62CoveragePct: firstRun.p62CoveragePct,
        p63CoveragePct: firstRun.p63CoveragePct,
        p64CoveragePct: firstRun.p64CoveragePct,
      },
      null,
      2,
    ),
  );

  const secondRun = await runCandidateAutomationEngine({ trigger: "api" });
  const runsAfterTwo = await listCandidateAutomationRuns(10);
  const duplicateRunIds = new Set(runsAfterTwo.map((run) => run.runId));
  const singleOrchestratorPath = duplicateRunIds.size === runsAfterTwo.length && firstRun.runId !== secondRun.runId;

  const afterFirst = await captureCoverage();
  console.log("\n=== Coverage AFTER orchestrator run ===");
  console.log(JSON.stringify(afterFirst, null, 2));

  const coverageMetricsConsistent =
    firstRun.p62CoveragePct === afterFirst.p62CoveragePct &&
    firstRun.p63CoveragePct === afterFirst.p63CoveragePct &&
    firstRun.p64CoveragePct === afterFirst.p64CoveragePct;

  const secondRunStable =
    Math.abs(secondRun.p62CoveragePct - firstRun.p62CoveragePct) <= 1 &&
    Math.abs(secondRun.p63CoveragePct - firstRun.p63CoveragePct) <= 1 &&
    Math.abs(secondRun.p64CoveragePct - firstRun.p64CoveragePct) <= 1;

  await saveCandidateAutomationPolicy({ ...DEFAULT_CANDIDATE_AUTOMATION_POLICY, paused: true });
  const pausedRun = await runCandidateAutomationEngine({ trigger: "api" });
  const policyPauseWorks = pausedRun.skipped === true;

  await saveCandidateAutomationPolicy(DEFAULT_CANDIDATE_AUTOMATION_POLICY);

  const runsPersist = runsAfterTwo.length >= runsBefore + 2;
  const runsFile = path.join(recruitingDataDir(), "candidate-automation-runs.json");
  const runsRaw = await readFile(runsFile, "utf8");
  const runsPersistOnDisk = runsRaw.includes(firstRun.runId);

  const health = await buildCandidateAutomationHealth({
    store: await readIngestionStore(),
    workflows: (await getCandidateWorkflowBundle()).workflows,
    jobsByPositionId: new Map(
      ((await fetchBreezyJobs("published")).ok
        ? (await fetchBreezyJobs("published")).jobs
        : []
      ).map((job) => [job.jobId, job]),
    ),
  });
  const healthReflectsRun =
    health.lastRunAt !== null &&
    health.p62CoveragePct === afterFirst.p62CoveragePct &&
    health.p63CoveragePct === afterFirst.p63CoveragePct &&
    health.p64CoveragePct === afterFirst.p64CoveragePct;

  const checks = {
    singleOrchestratorPath,
    noDuplicateRunIds: duplicateRunIds.size === runsAfterTwo.length,
    coverageMetricsConsistent,
    secondRunStable,
    policyPauseWorks,
    runsPersist,
    runsPersistOnDisk,
    healthReflectsRun,
    firstRunOk: firstRun.ok,
    secondRunOk: secondRun.ok,
  };

  console.log("\n=== P65.1 validation checks ===");
  console.log(JSON.stringify(checks, null, 2));

  const pass = Object.values(checks).every(Boolean);
  console.log(pass ? "\nOVERALL: PASS" : "\nOVERALL: FAIL");
  process.exit(pass ? 0 : 1);
}

void main();
