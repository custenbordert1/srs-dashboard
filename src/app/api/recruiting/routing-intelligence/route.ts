import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildCachedRoutingPlanningSnapshot } from "@/lib/routing-intelligence/build-routing-planning-cached";
import { fetchRoutingMelContext } from "@/lib/routing-intelligence/fetch-routing-mel-context";
import { logRoutingIntelligence } from "@/lib/routing-intelligence/routing-intelligence-log";
import {
  buildRoutingIntelligenceSummary,
  filterOpportunitiesByRoutingScope,
  hasRoutingScopeFilter,
  parseRoutingScopeFilters,
  ROUTING_PACK_ROW_LIMIT,
  ROUTING_SCOPE_OVER_LIMIT_MESSAGE,
  ROUTING_SCOPE_REQUIRED_MESSAGE,
} from "@/lib/routing-intelligence/routing-intelligence-scope";
import { listJobDrafts } from "@/lib/job-management/job-draft-store";
import type { RoutingPlanningSnapshot } from "@/lib/routing-intelligence/build-routing-planning";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/routing-intelligence";

type DraftLike = {
  title?: string;
  state?: string;
  cityTarget?: string;
  variant?: {
    title?: string;
    state?: string;
    cityTarget?: string;
  } | null;
};

function buildVariantTitlesByMetroFromDrafts(drafts: DraftLike[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const draft of drafts) {
    if (!draft.variant) continue;
    const cityTarget = String(draft.variant.cityTarget ?? draft.cityTarget ?? "").trim();
    const state = String(draft.variant.state ?? draft.state ?? "").trim();
    const title = String(draft.variant.title ?? draft.title ?? "Variant").trim();
    if (!cityTarget || !state || !title) continue;
    const city = cityTarget.split(",")[0]?.trim().toLowerCase() ?? "";
    if (!city) continue;
    const key = `${state}:${city}`;
    const titles = out[key] ?? [];
    if (!titles.includes(title)) titles.push(title);
    out[key] = titles;
  }
  return out;
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "recruiting_routing_intelligence",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "packs" ? "packs" : "summary";
  const scope = parseRoutingScopeFilters(url.searchParams);

  logRoutingIntelligence("build-start", { mode, route: ROUTE });

  const melStart = performance.now();
  const melContext = await fetchRoutingMelContext(session);
  logRoutingIntelligence("mel-load", {
    ms: Math.round(performance.now() - melStart),
    ok: melContext.ok,
  });

  if (!melContext.ok) {
    return NextResponse.json({ ok: false, error: melContext.error }, { status: 503 });
  }

  const summary = buildRoutingIntelligenceSummary({
    fetchedAt: melContext.fetchedAt,
    territoryLabel: melContext.territoryLabel,
    melRowCount: melContext.melRowCount,
    territoryOpportunities: melContext.territoryOpportunities,
    scope,
  });

  let routing: RoutingPlanningSnapshot | null = null;
  let packsError: string | null = null;
  let routingBuild:
    | {
        cacheHit: boolean;
        totalMs: number;
        clusteringMs: number;
        routePackMs: number;
        workspaceMs: number;
        payloadBytes: number;
      }
    | undefined;

  if (mode === "packs") {
    if (!hasRoutingScopeFilter(scope)) {
      packsError = ROUTING_SCOPE_REQUIRED_MESSAGE;
    } else {
      const scopedOpportunities = filterOpportunitiesByRoutingScope(
        melContext.territoryOpportunities,
        scope,
      );
      if (scopedOpportunities.length > ROUTING_PACK_ROW_LIMIT) {
        packsError = ROUTING_SCOPE_OVER_LIMIT_MESSAGE(
          scopedOpportunities.length,
          ROUTING_PACK_ROW_LIMIT,
        );
      } else if (scopedOpportunities.length === 0) {
        packsError = "No MEL stores match the selected scope.";
      } else {
        const drafts = await listJobDrafts();
        const variantTitlesByMetro = buildVariantTitlesByMetroFromDrafts(drafts as DraftLike[]);
        const packScopeKey = [
          melContext.territoryScope,
          scope.dm ?? "",
          scope.state ?? "",
          scope.project ?? "",
          scope.status ?? "all",
        ].join("|");
        const { snapshot, meta } = buildCachedRoutingPlanningSnapshot({
          fetchedAt: melContext.fetchedAt,
          melFetchedAt: melContext.melFetchedAt,
          territoryScope: `${melContext.territoryScope}::${packScopeKey}`,
          opportunities: scopedOpportunities,
          reps: melContext.reps,
          jobs: melContext.jobs,
          escalations: melContext.escalations,
          variantTitlesByMetro,
        });
        routing = snapshot;
        routingBuild = meta;
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      mode,
      summary,
      routing,
      packsError,
      meta: {
        refreshedAt: new Date().toISOString(),
        melRowCount: melContext.melRowCount,
        territoryRowCount: melContext.territoryOpportunities.length,
        scopedRowCount: summary.scopedRowCount,
        routingBuild,
        escalations: melContext.escalations,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
