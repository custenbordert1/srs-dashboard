import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { loadCandidateAutomationPolicy } from "@/lib/candidate-automation-engine";
import {
  getCandidateExecution,
  loadCandidateExecutionPolicy,
  retryEligibleExecution,
} from "@/lib/candidate-automation-execution";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const body = (await request.json()) as { executionId?: string };
  if (!body.executionId?.trim()) {
    return NextResponse.json({ ok: false, error: "executionId is required." }, { status: 400 });
  }

  const record = await getCandidateExecution(body.executionId);
  if (!record) {
    return NextResponse.json({ ok: false, error: "Execution record not found." }, { status: 404 });
  }

  const [store, bundle, jobsResult, executionPolicy, automationPolicy] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    loadCandidateExecutionPolicy(),
    loadCandidateAutomationPolicy(),
  ]);

  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const candidates = listIngestedCandidates(store);
  const candidatesById = new Map(
    candidates.map((candidate) => [
      candidate.candidateId,
      buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    ]),
  );

  const retried = await retryEligibleExecution({
    executionId: body.executionId,
    policy: executionPolicy,
    candidatesById,
    automationMode: automationPolicy.mode,
    byUserId: session.userId,
  });

  if (!retried) {
    return NextResponse.json({ ok: false, error: "Retry failed." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    record: retried,
  });
}
