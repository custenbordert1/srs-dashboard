import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildCoverageNeeds } from "@/lib/autonomous-recruiting-engine/build-coverage-needs";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { buildRecruiterCommandCenter } from "@/lib/recruiter-command-center";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const recruiterFilter = url.searchParams.get("recruiter");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  const [store, bundle, jobsResult, onboardingRecords, melResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listCandidateOnboardingRecords(500),
    fetchMelProjectsSheet(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const candidates = mtd.map((entry) =>
    buildScoredWorkflowRow(entry, bundle.workflows[entry.candidateId], {
      job: jobsByPositionId.get(entry.positionId),
    }),
  );

  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const coverageNeeds = buildCoverageNeeds({
    jobs: jobsResult.ok ? jobsResult.jobs : [],
    candidates: mtd,
    workflows: bundle.workflows,
    opportunities,
    fetchedAt: melResult.ok ? melResult.fetchedAt : new Date().toISOString(),
  });

  const commandCenter = buildRecruiterCommandCenter({
    candidates,
    onboardingRecords,
    coverageNeeds,
    recruiterFilter,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json({ ok: true, commandCenter });
}
