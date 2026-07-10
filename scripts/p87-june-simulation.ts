import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  runHiringDecisionSimulation,
  validateHiringDecisionQueues,
  buildP88AutonomousPaperworkPreview,
} from "@/lib/autonomous-hiring-decision-engine";
import { filterMtdCandidates, listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { currentMtdDateRange } from "@/lib/candidate-ingestion/mtd-candidates";

async function main() {
  const [store, bundle, jobsResult, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);
  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const range = currentMtdDateRange();
  const candidates = filterMtdCandidates(listIngestedCandidates(store), range);
  const rows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((record) => [record.candidateId, record]),
  );
  const simulation = runHiringDecisionSimulation({
    rows,
    jobsByPositionId,
    onboardingByCandidateId,
    mtdRangeLabel: `${range.start}..${range.end}`,
  });
  const validation = validateHiringDecisionQueues(simulation.decisions);
  const p88 = buildP88AutonomousPaperworkPreview({
    fastTrackDecisions: simulation.queues.fast_track,
    rows,
    jobsByPositionId,
    onboardingByCandidateId,
  });

  const report = {
    generatedAt: simulation.generatedAt,
    mtdRangeLabel: simulation.mtdRangeLabel,
    validation,
    simulation: {
      totalCandidates: simulation.totalCandidates,
      fastTrackCount: simulation.fastTrackCount,
      recruiterReviewCount: simulation.recruiterReviewCount,
      holdCount: simulation.holdCount,
      rejectCount: simulation.rejectCount,
      missingInformationCount: simulation.missingInformationCount,
      averageConfidence: simulation.averageConfidence,
      estimatedRecruiterHoursSaved: simulation.estimatedRecruiterHoursSaved,
      readyForPaperworkCount: simulation.readyForPaperworkCount,
      readyForP84Count: simulation.readyForP84Count,
      topBlockReasons: simulation.topBlockReasons,
      executiveMetrics: simulation.executiveMetrics,
    },
    p88,
  };

  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p87-june-simulation-report.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
