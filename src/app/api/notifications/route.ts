import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import {
  buildNotificationCenterSnapshot,
  listNotificationOverlays,
  markNotificationsRead,
} from "@/lib/notification-engine";
import type { NotificationSeverity } from "@/lib/notification-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/notifications";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "notifications_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const url = new URL(request.url);
  const recruiter = url.searchParams.get("recruiter")?.trim() || null;
  const severity = (url.searchParams.get("severity")?.trim() || null) as NotificationSeverity | null;
  const unreadOnly = url.searchParams.get("unread") === "true";
  const includeDismissed = url.searchParams.get("includeDismissed") === "true";
  const requestedStates = url.searchParams
    .getAll("state")
    .map((state) => normalizeStateCode(state))
    .filter(Boolean);
  const territoryStates = filterStatesForSession(
    session,
    requestedStates.length > 0 ? requestedStates : undefined,
  );

  const [jobsResult, candidatesResult, workflows, melResult, activeReps, overlays] =
    await Promise.all([
      fetchBreezyJobs("published"),
      fetchBreezyCandidates({ scanMode: "fast" }),
      getCandidateWorkflowState(),
      fetchMelProjectsSheet(),
      listActiveRosterReps(),
      listNotificationOverlays(session.userId),
    ]);

  if (!jobsResult.ok) {
    const status = breezyFailureHttpStatus(jobsResult.error);
    return NextResponse.json(breezyFailureBody(jobsResult), { status });
  }
  if (!candidatesResult.ok) {
    const status = breezyFailureHttpStatus(candidatesResult.error);
    return NextResponse.json(breezyFailureBody(candidatesResult), { status });
  }

  const jobs = applyTerritoryToJobs(session, jobsResult.jobs);
  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;
  const melOpportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];

  const territoryReps =
    territoryStates && territoryStates.length > 0
      ? activeReps.filter((rep) => territoryStates.includes(normalizeStateCode(rep.state)))
      : activeReps;

  const coverage = buildCoverageRiskSnapshot({
    opportunities: melOpportunities,
    reps: territoryReps,
    candidates,
    fetchedAt,
    territoryStates: territoryStates ?? undefined,
  });

  const center = buildNotificationCenterSnapshot(
    {
      jobs,
      candidates,
      fetchedAt,
      workflows,
      coverage: melResult.ok ? coverage : null,
      territoryStates,
    },
    session,
    overlays,
    {
      recruiter,
      territoryStates,
      severity: severity && ["critical", "warning", "info"].includes(severity) ? severity : null,
      unreadOnly,
      includeDismissed,
    },
  );

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    notifications: center.notifications.length,
  });

  return NextResponse.json({
    ok: true,
    center,
    meta: {
      partialSync: candidatesResult.truncated ?? false,
      scanMode: candidatesResult.scanMode ?? "fast",
      positionsScanned: candidatesResult.positionsScanned ?? 0,
      totalPositionsAvailable: candidatesResult.totalPositionsAvailable ?? 0,
      hasCoverageData: melResult.ok,
      refreshedAt: new Date().toISOString(),
    },
  });
}

export async function PATCH(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "notifications_update",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const body = (await request.json()) as {
    sourceKeys?: string[];
    action?: "read" | "dismiss" | "resolve";
  };

  const sourceKeys = Array.isArray(body.sourceKeys)
    ? body.sourceKeys.filter((key): key is string => typeof key === "string" && key.length > 0)
    : [];
  const action = body.action ?? "read";

  if (sourceKeys.length === 0) {
    return NextResponse.json({ ok: false, error: "sourceKeys required" }, { status: 400 });
  }

  const status =
    action === "dismiss" ? "dismissed" : action === "resolve" ? "resolved" : "read";

  if (action === "read") {
    const updated = await markNotificationsRead(session, sourceKeys);
    return NextResponse.json({ ok: true, updated });
  }

  const { updateNotificationOverlay } = await import("@/lib/notification-engine/notification-store");
  const updated = [];
  for (const sourceKey of sourceKeys) {
    updated.push(await updateNotificationOverlay(session, sourceKey, status));
  }

  return NextResponse.json({ ok: true, updated: updated.length, overlays: updated });
}
