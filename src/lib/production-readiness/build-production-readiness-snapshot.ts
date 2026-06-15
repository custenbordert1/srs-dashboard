import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { PERMISSION_MATRIX } from "@/lib/production-readiness/types";
import {
  buildDataChangeHistory,
  buildLoginHistory,
  buildUnifiedAuditActivity,
} from "@/lib/production-readiness/audit-log-reader";
import { buildDataQualitySnapshot } from "@/lib/production-readiness/build-data-quality-snapshot";
import { buildProductionScorecard } from "@/lib/production-readiness/build-production-scorecard";
import { buildPlatformDiagnosticsReport } from "@/lib/platform-diagnostics/build-platform-diagnostics-report";
import { buildIntegrationStatusSnapshot } from "@/lib/production-readiness/build-system-status-snapshot";
import { buildDeploymentChecklist, buildStartupDiagnostics } from "@/lib/production-readiness/deployment-readiness";
import { buildDemoModeSnapshot } from "@/lib/production-readiness/demo-mode";
import { getServerCacheMetrics } from "@/lib/production-readiness/server-computation-cache";
import { listUserProfiles } from "@/lib/production-readiness/user-management";
import type { ProductionReadinessSnapshot } from "@/lib/production-readiness/types";

export type ProductionReadinessContext = {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  opportunities: MelOpportunity[];
  syncFailures: string[];
  fetchedAt: string;
};

export async function buildProductionReadinessSnapshot(
  ctx: ProductionReadinessContext,
): Promise<ProductionReadinessSnapshot> {
  const [users, auditActivity, loginHistory, dataChanges] = await Promise.all([
    listUserProfiles(true),
    buildUnifiedAuditActivity(40),
    buildLoginHistory(20),
    buildDataChangeHistory(20),
  ]);

  const cache = getServerCacheMetrics();

  const base = {
    fetchedAt: ctx.fetchedAt,
    permissionMatrix: PERMISSION_MATRIX,
    users,
    auditActivity,
    loginHistory,
    dataChanges,
    integrationStatus: buildIntegrationStatusSnapshot(ctx.fetchedAt),
    dataQuality: buildDataQualitySnapshot(ctx),
    performance: {
      serverCacheEntries: cache.entries,
      serverCacheHitRate: cache.hitRate,
      recommendedClientCacheTtlMs: 90_000,
      lazyLoadedTabs: 20,
      backgroundRefreshEnabled: true,
    },
    errorHealth: {
      recentApiFailures: ctx.syncFailures.length,
      retryFrameworkEnabled: true,
      globalErrorTracking: true,
      lastHealthCheckAt: ctx.fetchedAt,
    },
    deploymentChecklist: buildDeploymentChecklist(),
    demoMode: buildDemoModeSnapshot(),
    startupDiagnostics: buildStartupDiagnostics(),
  };

  const productionScorecard = buildProductionScorecard(base as ProductionReadinessSnapshot);

  return {
    ...base,
    productionScorecard,
    platformDiagnostics: buildPlatformDiagnosticsReport({
      snapshot: base as ProductionReadinessSnapshot,
      syncFailureCount: ctx.syncFailures.length,
    }),
  };
}

export { SERVER_CACHE_DEFAULT_TTL_MS, withServerCache } from "@/lib/production-readiness/server-computation-cache";
