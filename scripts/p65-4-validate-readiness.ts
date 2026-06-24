/**
 * P65.4 read-only validation — recruiter replacement readiness audit.
 * Usage: npx tsx scripts/p65-4-validate-readiness.ts
 */
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { buildRecruiterReplacementReadiness } from "@/lib/recruiter-replacement-readiness";

async function main() {
  const [store, bundle, jobsResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
  ]);
  const jobsByPositionId = new Map((jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]));
  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const rows = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const readiness = buildRecruiterReplacementReadiness({
    candidates: mtd,
    rows,
    workflows: bundle.workflows,
    jobsByPositionId,
    rosters: bundle.rosters,
  });

  const checks = {
    auditComplete: readiness.audit.totalCandidates === mtd.length,
    gateTracingComplete:
      Object.values(readiness.gateFailureCounts).reduce((sum, count) => sum + count, 0) === mtd.length,
    scoresPresent:
      readiness.readinessScore.assignmentReadinessPct >= 0 &&
      readiness.readinessScore.paperworkReadinessPct >= 0,
    rootCauseIdentified: Boolean(readiness.rootCause.summary && readiness.rootCause.recommendedFixLocation),
    paperworkEligibleTracked: readiness.paperworkEligible >= 0,
  };

  console.log("\n=== P65.4 Recruiter Replacement Readiness Audit ===\n");
  console.log("--- Funnel stage counts ---");
  console.log(JSON.stringify(readiness.audit, null, 2));
  console.log("\n--- First failing gate counts ---");
  console.log(JSON.stringify(readiness.firstStageFailedCounts, null, 2));
  console.log("\n--- Exclusion / failure reason counts ---");
  console.log(JSON.stringify(readiness.gateFailureCounts, null, 2));
  console.log("\n--- Readiness scores ---");
  console.log(JSON.stringify(readiness.readinessScore, null, 2));
  console.log("\n--- Automation blockers ---");
  console.log(JSON.stringify(readiness.blockers, null, 2));
  console.log("\n--- Root cause ---");
  console.log(JSON.stringify(readiness.rootCause, null, 2));
  console.log("\n--- Validation checks ---");
  console.log(JSON.stringify(checks, null, 2));

  const pass = Object.values(checks).every(Boolean);
  console.log(pass ? "\nOVERALL: PASS" : "\nOVERALL: FAIL");
  process.exit(pass ? 0 : 1);
}

void main();
