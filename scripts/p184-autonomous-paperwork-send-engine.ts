import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import {
  formatP184Markdown,
  runP184AutonomousPaperworkSendEngine,
  updateP184Config,
} from "@/lib/p184-autonomous-paperwork-send-engine";

async function main() {
  await updateP184Config({ enabled: true, mode: "dry_run" });

  const store = await readIngestionStore();
  const bundle = await getCandidateWorkflowBundle();
  const jobsResult = await fetchBreezyJobs("published");
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const candidates = listIngestedCandidates(store).map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );
  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const result = await runP184AutonomousPaperworkSendEngine({
    candidates,
    onboardingByCandidateId,
    jobsByPositionId,
    mode: "dry_run",
  });

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  const jsonPath = path.join(artifactsDir, "paperwork-send-validation.json");
  const mdPath = path.join(artifactsDir, "paperwork-send-validation.md");
  await writeFile(jsonPath, `${JSON.stringify(result.report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP184Markdown(result.report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        mdPath,
        evaluated: result.evaluated,
        eligible: result.eligible,
        projectedSends: result.report.projectedSends,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
