import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { buildJobApplicantCountsSnapshot } from "@/lib/job-management/job-applicant-counts";
import { peekBreezyJobCatalogLookupJobs } from "@/lib/job-management/breezy-job-catalog";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/job-management/applicant-counts";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    auditAction: "job_management_applicant_counts_read",
  });
  if (isGuardFailure(guard)) return guard;

  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const lookupJobs =
    peekBreezyJobCatalogLookupJobs(true)?.map((job) => ({
      jobId: job.jobId,
      friendlyId: job.friendlyId,
      name: job.name,
    })) ?? [];

  const snapshot = buildJobApplicantCountsSnapshot(lookupJobs);

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

type ApplicantCountsBody = {
  jobs?: Array<{ jobId?: string; name?: string; friendlyId?: string }>;
};

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    auditAction: "job_management_applicant_counts_read",
  });
  if (isGuardFailure(guard)) return guard;

  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  let body: ApplicantCountsBody = {};
  try {
    body = (await request.json()) as ApplicantCountsBody;
  } catch {
    body = {};
  }

  const fromBody = Array.isArray(body.jobs)
    ? body.jobs
        .map((job) => ({
          jobId: typeof job.jobId === "string" ? job.jobId.trim() : "",
          name: typeof job.name === "string" ? job.name : undefined,
          friendlyId: typeof job.friendlyId === "string" ? job.friendlyId : undefined,
        }))
        .filter((job) => job.jobId.length > 0)
    : [];

  const lookupJobs =
    fromBody.length > 0
      ? fromBody
      : (peekBreezyJobCatalogLookupJobs(true)?.map((job) => ({
          jobId: job.jobId,
          friendlyId: job.friendlyId,
          name: job.name,
        })) ?? []);

  const snapshot = buildJobApplicantCountsSnapshot(lookupJobs);

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
