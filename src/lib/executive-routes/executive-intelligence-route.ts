import type { AuthSession } from "@/lib/auth/types";
import { logBreezyRouteResult } from "@/lib/breezy-route-log";
import {
  EXECUTIVE_ROUTE_DEADLINE_MS,
  ExecutiveRouteTimer,
  shouldDeferExecutiveComputation,
} from "@/lib/executive-routes/executive-route-profiling";
import {
  buildRouteBundleFromSnapshot,
  loadRecruitingIntelligenceRouteBundle,
  type LoadRecruitingIntelligenceRouteBundleOptions,
  type RecruitingIntelligenceRouteBundle,
} from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildRecruitingIntelligenceSnapshotFromWarmCaches } from "@/lib/recruiting-intelligence/build-recruiting-intelligence-snapshot";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import { NextResponse } from "next/server";

import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

export type ExecutiveIntelligenceRouteMeta = {
  partialSync: boolean;
  refreshedAt: string;
  intelligenceCache: RecruitingIntelligenceCacheMeta;
  deferred: boolean;
  servedFromCache: boolean;
  timedOut: boolean;
  melOk: boolean;
  warnings: string[];
  timings: ReturnType<ExecutiveRouteTimer["toReport"]>;
};

export type ExecutiveIntelligenceRouteContext = {
  bundle: RecruitingIntelligenceRouteBundle;
  session: AuthSession;
  deferExpensive: boolean;
  timer: ExecutiveRouteTimer;
};

type BuildExecutiveRouteResult<TSnapshot> = {
  snapshot: TSnapshot;
  logExtras?: Record<string, unknown>;
  responseExtras?: Record<string, unknown>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadBundleWithDeadline(
  session: AuthSession,
  options: LoadRecruitingIntelligenceRouteBundleOptions,
  deadlineMs = EXECUTIVE_ROUTE_DEADLINE_MS,
): Promise<{ bundle: RecruitingIntelligenceRouteBundle; timedOut: boolean }> {
  const warmFallback = async (): Promise<{ bundle: RecruitingIntelligenceRouteBundle; timedOut: boolean }> => {
    const warm = await buildRecruitingIntelligenceSnapshotFromWarmCaches();
    return {
      bundle: buildRouteBundleFromSnapshot(session, warm, {
        unscopedForAdmin: options.unscopedForAdmin,
        territoryStates: options.territoryStates,
        scopeRepsToTerritory: options.scopeRepsToTerritory,
        intelligenceCache: {
          cacheStatus: "warm-serving",
          snapshotAgeMs: 0,
          isStale: true,
          backgroundRefresh: true,
          lastRefreshAt: warm.fetchedAt,
          recordCounts: {
            jobCount: warm.metrics.jobCount,
            candidateCount: warm.metrics.candidateCount,
            opportunityCount: warm.metrics.opportunityCount,
            workflowCount: warm.metrics.workflowCount,
          },
        },
      }),
      timedOut: true,
    };
  };

  const raced = await Promise.race([
    loadRecruitingIntelligenceRouteBundle(session, {
      ...options,
      allowPartialSources: true,
    }).then(async (result) => {
      if (result.ok) {
        return { kind: "loaded" as const, bundle: result.bundle, timedOut: false };
      }
      return { kind: "fallback" as const, ...(await warmFallback()) };
    }),
    sleep(deadlineMs).then(async () => ({ kind: "timeout" as const, ...(await warmFallback()) })),
  ]);

  if (raced.kind === "timeout") {
    console.warn("[executive-intelligence] bundle_deadline_exceeded", {
      deadlineMs,
      preferCache: options.preferCache ?? false,
    });
  }

  return { bundle: raced.bundle, timedOut: raced.timedOut };
}

export type ExecutiveIntelligenceBundleResult = {
  bundle: RecruitingIntelligenceRouteBundle;
  deferExpensive: boolean;
  timedOut: boolean;
  servedFromCache: boolean;
};

export async function loadExecutiveIntelligenceBundle(
  request: Request,
  session: AuthSession,
  route: string,
  timer: ExecutiveRouteTimer,
  bundleOptions: Omit<LoadRecruitingIntelligenceRouteBundleOptions, "forceRefresh" | "preferCache"> = {},
): Promise<ExecutiveIntelligenceBundleResult> {
  const forceRefresh = new URL(request.url).searchParams.get("forceRefresh") === "1";
  const { bundle, timedOut } = await loadBundleWithDeadline(session, {
    ...bundleOptions,
    forceRefresh,
    preferCache: !forceRefresh,
  });
  timer.mark("intelligence_bundle", {
    candidateCount: bundle.candidates.length,
    jobCount: bundle.jobs.length,
    details: {
      cacheStatus: bundle.intelligenceCache.cacheStatus,
      backgroundRefresh: bundle.intelligenceCache.backgroundRefresh,
      partialCandidateSync: bundle.candidatesResult.partial ?? false,
      melOk: bundle.melOk,
      timedOut,
    },
  });

  const deferExpensive = timedOut || shouldDeferExecutiveComputation(timer);
  return {
    bundle,
    deferExpensive,
    timedOut,
    servedFromCache:
      timedOut ||
      bundle.intelligenceCache.cacheStatus !== "miss" ||
      bundle.intelligenceCache.backgroundRefresh,
  };
}

export async function respondExecutiveIntelligenceRoute<TSnapshot>(input: {
  route: string;
  session: AuthSession;
  request: Request;
  timer: ExecutiveRouteTimer;
  bundleOptions?: Omit<LoadRecruitingIntelligenceRouteBundleOptions, "forceRefresh" | "preferCache">;
  build: (context: ExecutiveIntelligenceRouteContext) => BuildExecutiveRouteResult<TSnapshot> | Promise<BuildExecutiveRouteResult<TSnapshot>>;
}) {
  const bundleResult = await loadExecutiveIntelligenceBundle(
    input.request,
    input.session,
    input.route,
    input.timer,
    input.bundleOptions,
  );

  const { bundle, deferExpensive, servedFromCache, timedOut } = bundleResult;
  const built = await input.build({
    bundle,
    session: input.session,
    deferExpensive,
    timer: input.timer,
  });
  input.timer.mark("snapshot_built", built.logExtras);

  const warnings: string[] = [];
  if (timedOut) warnings.push("Executive route deadline exceeded — partial snapshot returned.");
  if (!bundle.melOk) warnings.push("MEL projects data unavailable — coverage alerts may be incomplete.");
  if (bundle.candidatesResult.partial) {
    warnings.push("Breezy candidate sync is partial.");
  }

  const deferred =
    deferExpensive ||
    timedOut ||
    bundle.intelligenceCache.backgroundRefresh ||
    Boolean(bundle.candidatesResult.partial) ||
    !bundle.melOk;

  logBreezyRouteResult(input.route, 200, {
    role: input.session.role,
    breezyOk: true,
    deferred,
    timedOut,
    melOk: bundle.melOk,
    totalMs: input.timer.elapsedMs(),
    candidateCount: bundle.candidates.length,
    ...built.logExtras,
  });

  const meta: ExecutiveIntelligenceRouteMeta = {
    partialSync: bundle.candidatesResult.partial ?? false,
    refreshedAt: bundle.fetchedAt,
    intelligenceCache: bundle.intelligenceCache,
    deferred,
    servedFromCache,
    timedOut,
    melOk: bundle.melOk,
    warnings,
    timings: input.timer.toReport(deferred),
  };

  return NextResponse.json({
    ok: true,
    snapshot: built.snapshot,
    meta: {
      ...meta,
      ...(built.responseExtras ?? {}),
    },
    ...built.responseExtras,
  });
}
