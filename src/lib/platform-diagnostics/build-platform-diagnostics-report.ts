import type { ProductionReadinessSnapshot } from "@/lib/production-readiness/types";
import { UI_PERFORMANCE } from "@/lib/ui-tokens";

export type PlatformPageId =
  | "executive-operations"
  | "candidates"
  | "dm-portal"
  | "territory-intelligence"
  | "action-center";

export type PlatformPageDiagnostic = {
  id: PlatformPageId;
  label: string;
  category: "executive" | "operations" | "intelligence";
  loadClass: "normal" | "heavy";
  targetMs: number;
  lazyLoaded: boolean;
  status: "on-target" | "at-risk" | "unknown";
  notes: string;
};

export type PlatformDiagnosticsReport = {
  generatedAt: string;
  pages: PlatformPageDiagnostic[];
  apiTargets: {
    normalMs: number;
    heavyMs: number;
  };
  clientGuidance: string[];
  serverSignals: {
    cacheHitRate: number;
    lazyTabCount: number;
    integrationHealthy: number;
    integrationTotal: number;
    dataQualityIssues: number;
    syncFailures: number;
  };
};

const PAGE_DEFINITIONS: Array<Omit<PlatformPageDiagnostic, "status" | "notes">> = [
  {
    id: "executive-operations",
    label: "Executive Operations Center",
    category: "executive",
    loadClass: "heavy",
    targetMs: UI_PERFORMANCE.heavyLoadMs,
    lazyLoaded: true,
  },
  {
    id: "candidates",
    label: "Candidates Workspace",
    category: "operations",
    loadClass: "heavy",
    targetMs: UI_PERFORMANCE.heavyLoadMs,
    lazyLoaded: true,
  },
  {
    id: "dm-portal",
    label: "DM Portal",
    category: "operations",
    loadClass: "normal",
    targetMs: UI_PERFORMANCE.normalLoadMs,
    lazyLoaded: false,
  },
  {
    id: "territory-intelligence",
    label: "Territory Intelligence",
    category: "intelligence",
    loadClass: "heavy",
    targetMs: UI_PERFORMANCE.heavyLoadMs,
    lazyLoaded: true,
  },
  {
    id: "action-center",
    label: "Action Center",
    category: "intelligence",
    loadClass: "heavy",
    targetMs: UI_PERFORMANCE.heavyLoadMs,
    lazyLoaded: true,
  },
];

export function buildPlatformDiagnosticsReport(input: {
  snapshot: ProductionReadinessSnapshot;
  syncFailureCount: number;
  measuredApiMs?: Partial<Record<PlatformPageId, number>>;
}): PlatformDiagnosticsReport {
  const integrationHealthy = input.snapshot.integrationStatus.filter(
    (row) => row.status === "healthy",
  ).length;

  const pages: PlatformPageDiagnostic[] = PAGE_DEFINITIONS.map((page) => {
    const measured = input.measuredApiMs?.[page.id];
    let status: PlatformPageDiagnostic["status"] = "unknown";
    let notes = `Target <${page.targetMs}ms (${page.loadClass} page).`;

    if (measured !== undefined) {
      status = measured <= page.targetMs ? "on-target" : "at-risk";
      notes = `Measured ${measured}ms — target <${page.targetMs}ms.`;
    } else if (page.lazyLoaded && input.snapshot.performance.backgroundRefreshEnabled) {
      notes = "Lazy-loaded with background refresh; initial shell should render <2s.";
      status = "on-target";
    }

    return { ...page, status, notes };
  });

  return {
    generatedAt: input.snapshot.fetchedAt,
    pages,
    apiTargets: {
      normalMs: UI_PERFORMANCE.normalLoadMs,
      heavyMs: UI_PERFORMANCE.heavyLoadMs,
    },
    clientGuidance: [
      "Use cached Breezy snapshots when partial sync is active.",
      "Prefer filter chips before reloading full candidate tables.",
      "Heavy intelligence routes use 110s client timeout with stale-while-revalidate.",
    ],
    serverSignals: {
      cacheHitRate: input.snapshot.performance.serverCacheHitRate,
      lazyTabCount: input.snapshot.performance.lazyLoadedTabs,
      integrationHealthy,
      integrationTotal: input.snapshot.integrationStatus.length,
      dataQualityIssues: input.snapshot.dataQuality.length,
      syncFailures: input.syncFailureCount,
    },
  };
}
