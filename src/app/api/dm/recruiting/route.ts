import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import {
  buildDmRecruitingFoundation,
  type DmRecruitingFoundationSection,
} from "@/lib/dm-dashboard/dm-recruiting-foundation";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/dm/recruiting";
const ALLOWED_SECTIONS = new Set<DmRecruitingFoundationSection>([
  "summary",
  "jobs",
  "candidates",
  "stores",
  "coverage",
]);

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["dm", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "dm_recruiting_foundation",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const sectionParam = searchParams.get("section")?.trim();
  const sections = sectionParam
    ? sectionParam
        .split(",")
        .map((value) => value.trim() as DmRecruitingFoundationSection)
        .filter((value): value is DmRecruitingFoundationSection => ALLOWED_SECTIONS.has(value))
    : undefined;

  const jobState = searchParams.get("jobState")?.trim() || "published";
  const includeMel = searchParams.get("includeMel") !== "false";

  const [jobsResult, candidatesResult, melResult] = await Promise.all([
    fetchBreezyJobs(jobState),
    fetchBreezyCandidates(),
    includeMel ? fetchMelProjectsSheet() : null,
  ]);

  if (!jobsResult.ok) {
    const status = breezyFailureHttpStatus(jobsResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false, phase: "jobs" });
    return NextResponse.json(breezyFailureBody(jobsResult), { status });
  }
  if (!candidatesResult.ok) {
    const status = breezyFailureHttpStatus(candidatesResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false, phase: "candidates" });
    return NextResponse.json(breezyFailureBody(candidatesResult), { status });
  }

  const melOpportunities =
    melResult?.ok === true ? parseMelOpportunities(melResult.rows) : [];

  const foundation = buildDmRecruitingFoundation(session, jobsResult.jobs, candidatesResult.candidates, candidatesResult.fetchedAt, {
    partialCandidateSync: candidatesResult.truncated ?? false,
    melOpportunities,
    sections,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    activeJobs: foundation.summary.activeJobs,
    candidates: foundation.summary.candidates,
    partialSync: foundation.partialCandidateSync,
    sections: sections?.join(",") ?? "all",
  });

  return NextResponse.json(
    {
      ok: true,
      foundation,
      meta: {
        jobState,
        includeMel,
        totalJobsFromBreezy: jobsResult.jobs.length,
        totalCandidatesFromBreezy: candidatesResult.candidates.length,
        positionsScanned: candidatesResult.positionsScanned ?? null,
        truncated: candidatesResult.truncated ?? false,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
