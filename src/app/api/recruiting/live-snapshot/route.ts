import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { guardBreezyCandidatesResult, guardBreezyJobsResult } from "@/lib/auth/breezy-territory-guard";
import { buildRecruitingLiveSnapshot } from "@/lib/recruiting-live-snapshot";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_live_snapshot_read",
  });
  if (isGuardFailure(guard)) return guard;

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  const snapshot = await buildRecruitingLiveSnapshot({ force });

  if (!snapshot.ok) {
    const status = snapshot.fallback?.candidates?.ok || snapshot.fallback?.jobs?.ok ? 200 : 503;
    if (status === 200 && snapshot.fallback) {
      const jobs = snapshot.fallback.jobs?.ok
        ? guardBreezyJobsResult(snapshot.fallback.jobs, guard.session)
        : null;
      const candidates = snapshot.fallback.candidates?.ok
        ? guardBreezyCandidatesResult(snapshot.fallback.candidates, guard.session)
        : null;
      return NextResponse.json(
        {
          ...snapshot,
          partial: true,
          jobs,
          candidates,
        },
        {
          headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
        },
      );
    }
    return NextResponse.json(snapshot, { status: 503 });
  }

  const jobs = guardBreezyJobsResult(snapshot.jobs, guard.session);
  const candidates = guardBreezyCandidatesResult(snapshot.candidates, guard.session);

  if (!jobs.ok || !candidates.ok) {
    return NextResponse.json(
      { ok: false, error: "Territory guard failed for Breezy snapshot." },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      ...snapshot,
      jobs,
      candidates,
    },
    {
      headers: {
        "Cache-Control": force ? "no-store" : "private, max-age=60, stale-while-revalidate=120",
      },
    },
  );
}
