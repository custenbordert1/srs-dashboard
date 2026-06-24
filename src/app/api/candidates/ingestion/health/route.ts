import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildApplicantCaptureHealth } from "@/lib/candidate-ingestion";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const { searchParams } = new URL(request.url);
  const referenceMtd = Number.parseInt(searchParams.get("reference_mtd") ?? "", 10);

  const [store, bundle, jobsResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
  ]);

  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));

  const health = buildApplicantCaptureHealth({
    store,
    workflows: bundle.workflows,
    jobsByPositionId,
    referenceBreezyMtd: Number.isFinite(referenceMtd) ? referenceMtd : undefined,
  });

  return NextResponse.json({
    ok: true,
    health,
    updatedAt: store.updatedAt,
  });
}
