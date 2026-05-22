import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getBreezyApiKeySync } from "@/lib/config";
import { breezyConfigErrorMessage } from "@/lib/env-validation";
import {
  FROZEN_BREEZY_CANDIDATE_LIST_STRATEGY,
  getCachedBreezyCandidateListStrategy,
  isBreezyCandidateEndpointProbeEnabled,
  probeBreezyCandidateEndpoints,
} from "@/lib/breezy-global-candidates";
import { fetchBreezyJobs, resolveBreezyCompany } from "@/lib/breezy-api";
import { logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { blockBreezyWriteRoute } from "@/lib/security/read-only";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/breezy/candidates/probe";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "breezy_candidates_probe_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);

  if (!isBreezyCandidateEndpointProbeEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Endpoint probing is disabled. Set BREEZY_CANDIDATES_PROBE_ENDPOINTS=true to run diagnostics.",
        frozenStrategy: FROZEN_BREEZY_CANDIDATE_LIST_STRATEGY,
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const apiKey = getBreezyApiKeySync();
  if (!apiKey) {
    const error = breezyConfigErrorMessage();
    logBreezyRouteResult(ROUTE, 503, { breezyOk: false });
    return NextResponse.json({ ok: false, error }, { status: 503 });
  }

  const companyResult = await resolveBreezyCompany();
  if (!companyResult.ok) {
    logBreezyRouteResult(ROUTE, 503, { breezyOk: false });
    return NextResponse.json({ ok: false, error: companyResult.error }, { status: 503 });
  }
  const companyId = companyResult.companyId;

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const pageSize = Number.parseInt(searchParams.get("page_size") ?? "5", 10);

  const jobsResult = await fetchBreezyJobs("published");
  const sampleJob = jobsResult.ok ? jobsResult.jobs[0] : null;

  const report = await probeBreezyCandidateEndpoints({
    companyId,
    samplePositionId: sampleJob?.jobId ?? null,
    samplePositionAltId: sampleJob?.friendlyId ?? null,
    apiKey,
    pageSize: Number.isFinite(pageSize) ? pageSize : 5,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    winner: report.winner?.kind ?? null,
    probeCount: report.probes.length,
  });

  return NextResponse.json(
    {
      ok: true,
      companyId: report.companyId,
      samplePositionId: report.samplePositionId,
      samplePositionAltId: sampleJob?.friendlyId ?? null,
      winner: report.winner,
      cachedStrategy: force ? null : getCachedBreezyCandidateListStrategy(),
      probes: report.probes.map((probe) => ({
        label: probe.label,
        url: probe.url,
        queryParams: probe.queryParams,
        httpStatus: probe.httpStatus,
        ok: probe.ok,
        error: probe.error,
        shape: probe.shape,
        authHeaderFormat: probe.authHeaderFormat,
      })),
      probedAt: report.probedAt,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;
  return blockBreezyWriteRoute(request, guard.session) ?? NextResponse.json({ ok: false }, { status: 405 });
}
