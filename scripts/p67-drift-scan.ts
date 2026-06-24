/**
 * P67 read-only MTD workflow ↔ onboarding drift scan.
 * Usage: npx tsx scripts/p67-drift-scan.ts
 */
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { buildExecutivePaperworkDashboard } from "@/lib/executive-paperwork-dashboard";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { scanMtdWorkflowDrift } from "@/lib/workflow-onboarding-reconciliation";

async function main() {
  const [store, bundle, jobsResult, policy, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    loadCandidateOnboardingPolicy(),
    listCandidateOnboardingRecords(500),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const mtd = filterMtdCandidates(listIngestedCandidates(store));

  const driftScan = scanMtdWorkflowDrift({
    candidates: mtd,
    workflows: bundle.workflows,
    onboardingRecords,
  });

  const candidates = mtd.map((entry) =>
    buildScoredWorkflowRow(entry, bundle.workflows[entry.candidateId], {
      job: jobsByPositionId.get(entry.positionId),
    }),
  );
  const dashboard = buildExecutivePaperworkDashboard({
    candidates,
    onboardingRecords,
    policy,
  });

  console.log("\n=== P67 MTD Workflow ↔ Onboarding Drift Scan (read-only) ===\n");
  console.log("--- Summary ---");
  console.log(
    JSON.stringify(
      {
        scannedAt: driftScan.scannedAt,
        mtdCandidateCount: driftScan.mtdCandidateCount,
        driftCount: driftScan.driftCount,
        categoryBreakdown: driftScan.categoryBreakdown,
        executiveDashboardDriftCount: dashboard.kpiStrip.driftCount,
        approvalQueue: dashboard.kpiStrip.approvalQueue,
        approvalQueueRecruiterRollup: dashboard.approvalQueueRecruiterRollup,
      },
      null,
      2,
    ),
  );

  if (driftScan.entries.length > 0) {
    console.log("\n--- Affected candidates ---");
    for (const entry of driftScan.entries) {
      console.log(
        JSON.stringify({
          candidateId: entry.candidateId,
          categories: entry.categories,
          reasons: entry.reasons,
        }),
      );
    }
  }

  console.log(
    driftScan.driftCount === 0
      ? "\nOVERALL: NO DRIFT DETECTED"
      : `\nOVERALL: ${driftScan.driftCount} CANDIDATE(S) WITH DRIFT`,
  );
}

void main();
