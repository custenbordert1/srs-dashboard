import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates } from "@/lib/auth/territory-filter";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import {
  buildRecruiterProductivitySnapshot,
  listRecruiterFilterOptions,
  listTerritoryStateOptions,
} from "@/lib/recruiter-productivity-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/productivity";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "recruiting_productivity",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const url = new URL(request.url);
  const actingRecruiter = url.searchParams.get("recruiter")?.trim() || null;
  const requestedStates = url.searchParams.getAll("state").map((s) => normalizeStateCode(s)).filter(Boolean);
  const sessionStates = filterStatesForSession(session, requestedStates.length > 0 ? requestedStates : undefined);
  const territoryStates = sessionStates && sessionStates.length > 0 ? sessionStates : null;

  const [candidatesResult, workflows] = await Promise.all([
    fetchBreezyCandidates({ scanMode: "fast" }),
    getCandidateWorkflowState(),
  ]);

  if (!candidatesResult.ok) {
    const status = breezyFailureHttpStatus(candidatesResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(candidatesResult), { status });
  }

  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;

  const snapshot = buildRecruiterProductivitySnapshot({
    candidates,
    workflows,
    fetchedAt,
    filters: {
      actingRecruiter,
      territoryStates,
    },
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    filteredCandidates: candidates.length,
    actingRecruiter,
    territoryStates,
  });

  return NextResponse.json({
    ok: true,
    snapshot,
    filterOptions: {
      recruiters: listRecruiterFilterOptions(candidates, workflows, territoryStates),
      states: listTerritoryStateOptions(candidates),
    },
    meta: {
      partialSync: candidatesResult.truncated ?? false,
      scanMode: candidatesResult.scanMode ?? "fast",
      positionsScanned: candidatesResult.positionsScanned ?? 0,
      totalPositionsAvailable: candidatesResult.totalPositionsAvailable ?? 0,
      refreshedAt: new Date().toISOString(),
    },
  });
}
