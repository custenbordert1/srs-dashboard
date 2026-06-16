import type { AuthSession } from "@/lib/auth/types";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { logBreezyRouteResult } from "@/lib/breezy-route-log";
import {
  ExecutiveRouteTimer,
  shouldDeferExecutiveComputation,
} from "@/lib/executive-routes/executive-route-profiling";
import {
  loadRecruitingIntelligenceRouteBundle,
  type LoadRecruitingIntelligenceRouteBundleOptions,
  type RecruitingIntelligenceRouteBundle,
} from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import { NextResponse } from "next/server";

export type ExecutiveIntelligenceRouteMeta = {
  partialSync: boolean;
  refreshedAt: string;
  intelligenceCache: RecruitingIntelligenceCacheMeta;
  deferred: boolean;
  servedFromCache: boolean;
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

export async function loadExecutiveIntelligenceBundle(
  request: Request,
  session: AuthSession,
  route: string,
  timer: ExecutiveRouteTimer,
  bundleOptions: Omit<LoadRecruitingIntelligenceRouteBundleOptions, "forceRefresh" | "preferCache"> = {},
) {
  const forceRefresh = new URL(request.url).searchParams.get("forceRefresh") === "1";
  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    ...bundleOptions,
    forceRefresh,
    preferCache: !forceRefresh,
  });

  if (!loaded.ok) {
    return { ok: false as const, failure: loaded.failure };
  }

  const { bundle } = loaded;
  timer.mark("intelligence_bundle", {
    candidateCount: bundle.candidates.length,
    jobCount: bundle.jobs.length,
    details: {
      cacheStatus: bundle.intelligenceCache.cacheStatus,
      backgroundRefresh: bundle.intelligenceCache.backgroundRefresh,
      partialCandidateSync: bundle.candidatesResult.partial ?? false,
    },
  });

  const deferExpensive = shouldDeferExecutiveComputation(timer);
  return {
    ok: true as const,
    bundle,
    deferExpensive,
    servedFromCache:
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

  if (!bundleResult.ok) {
    const status = breezyFailureHttpStatus(bundleResult.failure.failure.error);
    logBreezyRouteResult(input.route, status, {
      role: input.session.role,
      breezyOk: false,
    });
    return NextResponse.json(breezyFailureBody(bundleResult.failure.failure), { status });
  }

  const { bundle, deferExpensive, servedFromCache } = bundleResult;
  const built = await input.build({
    bundle,
    session: input.session,
    deferExpensive,
    timer: input.timer,
  });
  input.timer.mark("snapshot_built", built.logExtras);

  const deferred =
    deferExpensive || bundle.intelligenceCache.backgroundRefresh || Boolean(bundle.candidatesResult.partial);

  logBreezyRouteResult(input.route, 200, {
    role: input.session.role,
    breezyOk: true,
    deferred,
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
