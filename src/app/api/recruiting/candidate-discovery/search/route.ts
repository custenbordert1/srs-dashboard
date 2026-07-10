import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { discoverCandidate } from "@/lib/p170-unified-candidate-discovery";
import { P170_SOURCE_PHASE } from "@/lib/p170-unified-candidate-discovery/types";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/candidate-discovery/search";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_candidate_discovery_search",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const skipDiscoveryStatus = searchParams.get("status") === "false";

  if (!query) {
    return NextResponse.json({ ok: false, error: "Missing search query (q)." }, { status: 400 });
  }

  const safe = await buildSafeApiResponse({
    label: "Candidate discovery search",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const result = await discoverCandidate(query, { skipDiscoveryStatus });
      return { result, warnings: result.warnings };
    },
    fallback: () => ({
      result: {
        sourcePhase: P170_SOURCE_PHASE,
        generatedAt: new Date().toISOString(),
        readOnly: true as const,
        query: {
          raw: query,
          name: null,
          email: null,
          phone: null,
          candidateId: null,
          positionId: null,
        },
        found: false,
        source: null,
        rescueInvoked: false,
        rescueSource: null,
        hydratedIntoStore: false,
        candidate: null,
        discovery: null,
        warnings: ["Discovery search degraded — try again."],
      },
      warnings: ["Discovery search degraded — try again."],
    }),
    mapWarnings: (p) => p.warnings,
  });

  return NextResponse.json({
    ok: true,
    result: safe.payload.result,
    warnings: safe.warnings,
    meta: safe.meta,
  });
}
