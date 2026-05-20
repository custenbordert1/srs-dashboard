import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchPublishedBreezyJobCatalog } from "@/lib/job-management/breezy-job-catalog";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "job_management_breezy_jobs_read",
  });
  if (isGuardFailure(guard)) return guard;

  const breezyCheck = await assertBreezyConfigured("/api/job-management/breezy-jobs");
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const snapshot = await fetchPublishedBreezyJobCatalog({ force });

  if (!snapshot.ok) {
    return NextResponse.json(snapshot, { status: 503 });
  }

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": force ? "no-store" : "private, max-age=120, stale-while-revalidate=60",
    },
  });
}
