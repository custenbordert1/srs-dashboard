/**
 * P106.3 — Autonomous Paperwork Diagnostic (dryRun only)
 * Usage:
 *   npx tsx scripts/p1063-autonomous-paperwork-diagnose.ts
 *   npx tsx scripts/p1063-autonomous-paperwork-diagnose.ts --skip-sync
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBlockedJobRecoveryReport } from "@/lib/closed-ad-project-mapping";
import { runAutonomousPaperworkRunnerCycle } from "@/lib/autonomous-paperwork-runner";
import { buildLiveSendOperatorChecklist } from "@/lib/live-send-operator-checklist";
import { runAutonomousPaperworkEngine } from "@/lib/p106-autonomous-paperwork-engine";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

function countBlockers(
  candidates: Array<{ category: string; blockerCategory: string | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    if (c.category !== "blocked" || !c.blockerCategory) continue;
    counts[c.blockerCategory] = (counts[c.blockerCategory] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  loadEnvLocal();
  const skipSync = process.argv.includes("--skip-sync");

  const [engineDryRun, runnerDryRun, p101] = await Promise.all([
    runAutonomousPaperworkEngine({ mode: "dryRun", mtdOnly: false }),
    runAutonomousPaperworkRunnerCycle({ mode: "dryRun", mtdOnly: false, skipBreezySync: skipSync }),
    buildLiveSendOperatorChecklist({ mtdOnly: false }),
  ]);

  const { readIngestionStore } = await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");

  const [store, bundle, jobsResult, closedJobsResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    fetchBreezyJobs("closed"),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const closedJobsByPositionId = new Map(
    (closedJobsResult.ok ? closedJobsResult.jobs : []).map((job) => [job.jobId, job]),
  );

  const rowsByCandidateId = new Map(
    Object.entries(store.candidates).map(([id, candidate]) => [
      id,
      buildScoredWorkflowRow(candidate, bundle.workflows[id], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    ]),
  );

  const recovery = buildBlockedJobRecoveryReport({
    candidates: engineDryRun.report.candidates,
    rowsByCandidateId,
    jobsByPositionId,
    closedJobsByPositionId,
    publishedJobs,
    storeCandidates: store.candidates,
  });

  const closedAdSendExamples = engineDryRun.report.candidates
    .filter((c) => {
      if (c.category !== "ready_to_send" && c.category !== "blocked") return false;
      const row = rowsByCandidateId.get(c.candidateId);
      if (!row?.positionId) return false;
      return closedJobsByPositionId.has(row.positionId) && !jobsByPositionId.has(row.positionId);
    })
    .filter((c) => c.category === "ready_to_send" || c.blockerCategory === "p84_gate_failed")
    .slice(0, 10)
    .map((c) => ({
      candidateId: c.candidateId,
      name: c.candidateName,
      category: c.category,
      blocker: c.blockerCategory,
    }));

  const recoveredExamples = recovery.groups
    .filter((g) => g.mappingStatus === "closed_ad_mapped_project")
    .slice(0, 5)
    .map((g) => ({
      positionId: g.positionId,
      title: g.jobTitle,
      candidateCount: g.candidateCount,
      candidateIds: g.candidateIds.slice(0, 3),
    }));

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: "dryRun",
    engine: {
      candidatesEvaluated: engineDryRun.report.metrics.candidatesEvaluated,
      readyToSend: engineDryRun.report.metrics.readyToSend,
      blocked: engineDryRun.report.blocked.length,
      blockerBreakdown: countBlockers(engineDryRun.report.candidates),
    },
    runner: {
      ok: runnerDryRun.ok,
      skippedOverlap: runnerDryRun.skippedOverlap,
      mode: runnerDryRun.mode,
      metrics: runnerDryRun.report.metrics,
      blockedRegistryCount: Object.keys(runnerDryRun.report.state.blockedRegistry).length,
      warnings: runnerDryRun.warnings,
    },
    closedAdRecovery: {
      totalBlockedJobCandidates: recovery.totalBlockedCandidates,
      recoveredByMappingCount: recovery.recoveredByMappingCount,
      wouldSendAfterMappingCount: recovery.wouldSendAfterMappingCount,
      topGroups: recovery.groups.slice(0, 10),
      recoveredExamples,
      closedAdSendExamples,
    },
    p101: {
      goNoGo: p101.goNoGo,
      cohortLabel: p101.cohortLabel,
      eligibleCohortCount: p101.metrics.eligibleCohortCount,
      readyToSend: p101.metrics.p100ReadyToSend,
    },
    productionConfig: {
      scheduleEnabled: process.env.AUTONOMOUS_PAPERWORK_RUNNER_SCHEDULE_ENABLED === "true",
      liveMode: process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE ?? null,
      dailyReconciliation: process.env.AUTONOMOUS_PAPERWORK_RUNNER_DAILY_RECONCILIATION === "true",
    },
  };

  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p1063-autonomous-paperwork-diagnose.json");
  await writeFile(artifactPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ ...summary, artifactPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
