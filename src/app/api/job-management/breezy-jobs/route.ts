import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyJobCatalog } from "@/lib/job-management/breezy-job-catalog";
import { reconcileAndPersistJobDrafts } from "@/lib/job-management/job-draft-reconcile-store";
import { JOB_MANAGEMENT_BREEZY_SOURCE } from "@/lib/job-management/job-draft-types";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    auditAction: "job_management_breezy_jobs_read",
  });
  if (isGuardFailure(guard)) return guard;

  const breezyCheck = await assertBreezyConfigured("/api/job-management/breezy-jobs");
  if (!breezyCheck.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: breezyCheck.error,
        fetchedAt: new Date().toISOString(),
        source: JOB_MANAGEMENT_BREEZY_SOURCE.label,
        sourcePath: JOB_MANAGEMENT_BREEZY_SOURCE.apiPath,
      },
      { status: breezyCheck.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const snapshot = await fetchBreezyJobCatalog({ force, includeDraft: true });

  if (!snapshot.ok) {
    return NextResponse.json(snapshot, { status: 503 });
  }

  const reconcile = await reconcileAndPersistJobDrafts(snapshot.jobs, snapshot.fetchedAt);

  return NextResponse.json(
    {
      ...snapshot,
      draftsRecoveredCount: reconcile.recoveredCount,
    },
    {
      headers: {
        "Cache-Control": force ? "no-store" : "private, max-age=120, stale-while-revalidate=60",
      },
    },
  );
}
