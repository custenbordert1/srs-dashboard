import { existsSync } from "node:fs";
import path from "node:path";
import { peekBreezyCandidatesCache } from "@/lib/breezy-api";
import {
  getIngestedCandidatesSnapshot,
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion";
import {
  ingestionPositionCoveragePct,
  isIngestionStoreUsable,
} from "@/lib/candidate-ingestion/ingestion-store";
import { loadPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import { buildRecruitingLiveSnapshot } from "@/lib/recruiting-live-snapshot";
import type { CandidateSyncDiagnosticReport } from "@/lib/p142-candidate-sync-diagnostic/types";
import { P142_DIAGNOSTIC_MODE, P142_SOURCE_PHASE } from "@/lib/p142-candidate-sync-diagnostic/types";

const PROJECT_ROOT = process.cwd();

function routeExists(apiPath: string): boolean {
  const pathOnly = apiPath.split("?")[0] ?? apiPath;
  const segment = pathOnly.replace(/^\/api\//, "").replace(/\/$/, "");
  const routeFile = path.join(PROJECT_ROOT, "src", "app", "api", segment, "route.ts");
  return existsSync(routeFile);
}

export async function buildCandidateSyncDiagnostic(input?: {
  skipLiveBreezyFetch?: boolean;
}): Promise<CandidateSyncDiagnosticReport> {
  const generatedAt = new Date().toISOString();
  const pilotConfig = loadPilotConfig();
  const store = await readIngestionStore();
  const ingestedCandidates = listIngestedCandidates(store);
  const ingestedSnapshot = await getIngestedCandidatesSnapshot();
  const peekPreview = peekBreezyCandidatesCache({ scanMode: "preview" });
  const peekFast = peekBreezyCandidatesCache({ scanMode: "fast" });

  const paperworkContext = input?.skipLiveBreezyFetch
    ? null
    : await loadPaperworkCandidates({ mtdOnly: false }).catch(() => null);

  let liveSnapshot: Awaited<ReturnType<typeof buildRecruitingLiveSnapshot>> | null = null;
  if (!input?.skipLiveBreezyFetch) {
    liveSnapshot = await buildRecruitingLiveSnapshot();
  }

  const ingestionPath = path.join(recruitingDataDir(), "candidate-ingestion.json");
  const positionCoveragePct = ingestionPositionCoveragePct(store);

  const cacheLayers = [
    {
      layer: "durable_ingestion_store",
      pathOrKey: ingestionPath,
      candidateCount: ingestedCandidates.length,
      timestamp: store.updatedAt,
      notes: [
        `cycleComplete=${store.cycleComplete}`,
        `scanned ${store.scannedPositionIds.length}/${store.publishedPositionsTotal} positions (${positionCoveragePct}%)`,
        "Used by P123/P124/P137/P141 paperwork loaders.",
      ],
    },
    {
      layer: "ingestion_api_snapshot",
      pathOrKey: "getIngestedCandidatesSnapshot()",
      candidateCount: ingestedSnapshot?.candidates.length ?? null,
      timestamp: ingestedSnapshot?.fetchedAt ?? null,
      notes: [
        ingestedSnapshot
          ? `hydrationComplete=${ingestedSnapshot.hydrationComplete}`
          : "Snapshot unavailable — store not usable.",
        "Served by /api/breezy/candidates when scan is not preview and force=false.",
      ],
    },
    {
      layer: "server_preview_cache",
      pathOrKey: "breezy-api candidatesCache (scan=preview)",
      candidateCount: peekPreview?.ok ? peekPreview.candidates.length : null,
      timestamp: peekPreview?.fetchedAt ?? null,
      notes: [
        peekPreview ? "In-process cache populated." : "Cold — no preview cache in this server process.",
        "Used by /api/recruiting/live-snapshot for Candidates Pulled KPI.",
      ],
    },
    {
      layer: "server_fast_cache",
      pathOrKey: "breezy-api candidatesCache (scan=fast)",
      candidateCount: peekFast?.ok ? peekFast.candidates.length : null,
      timestamp: peekFast?.fetchedAt ?? null,
      notes: ["Background warm target for dashboard; also in-process only."],
    },
  ];

  const apiPaths: CandidateSyncDiagnosticReport["apiPaths"] = [
    {
      path: "/api/recruiting/live-snapshot",
      scanMode: "preview (via buildRecruitingLiveSnapshot)",
      candidateCount:
        liveSnapshot?.ok === true ? liveSnapshot.candidates.candidates.length : null,
      ok: liveSnapshot?.ok ?? null,
      usesIngestionStore: false,
      error: liveSnapshot?.ok === false ? liveSnapshot.error : null,
    },
    {
      path: "/api/breezy/candidates",
      scanMode: "default (ingestion fast path)",
      candidateCount: ingestedSnapshot?.candidates.length ?? null,
      ok: ingestedSnapshot ? true : null,
      usesIngestionStore: true,
      error: ingestedSnapshot ? null : "Ingestion store not served on this path when empty/unusable.",
    },
    {
      path: "/api/breezy/candidates?scan=preview",
      scanMode: "preview",
      candidateCount: peekPreview?.ok ? peekPreview.candidates.length : liveSnapshot?.ok ? liveSnapshot.candidates.candidates.length : null,
      ok: true,
      usesIngestionStore: false,
      error: null,
    },
    {
      path: "/api/autonomous-operations-center?scope=paperwork",
      scanMode: null,
      candidateCount: paperworkContext?.candidateIds.length ?? null,
      ok: paperworkContext ? true : null,
      usesIngestionStore: true,
      error: null,
    },
  ];

  const liveCandidatesPulled =
    liveSnapshot?.ok === true ? liveSnapshot.candidates.candidates.length : null;

  const ingestionAheadOfLive =
    ingestedCandidates.length > 0 &&
    (liveCandidatesPulled === null ||
      liveCandidatesPulled === 0 ||
      ingestedCandidates.length > liveCandidatesPulled * 2);

  const rootCause = ingestionAheadOfLive
    ? liveCandidatesPulled === 0
      ? "Recruiting Command Center reads preview/in-memory Breezy candidate cache via /api/recruiting/live-snapshot, which does not use the durable ingestion store. After a cold server start or a preview scan that hits the 18s budget with empty early positions, the UI shows Candidates Pulled = 0 even though candidate-ingestion.json holds the full paperwork cohort."
      : `Recruiting Command Center and live-snapshot use preview/in-memory Breezy scans (${liveCandidatesPulled ?? 0} candidates) while durable ingestion holds ${ingestedCandidates.length}. P137/P141 paperwork phases read ingestion directly, so operators see ${ingestedCandidates.length} evaluated candidates in certification but far fewer (or zero) on the Recruiting Command Center tab.`
    : ingestedCandidates.length === 0
      ? "Durable candidate ingestion store is empty — no candidates have been synced into .data/candidate-ingestion.json."
      : input?.skipLiveBreezyFetch
        ? "Ingestion store populated; live snapshot fetch skipped in this diagnostic run."
        : "Candidate counts are aligned between ingestion and live snapshot in this run.";

  const exactFailingComponent = ingestionAheadOfLive
    ? "src/lib/recruiting-live-snapshot.ts — buildRecruitingLiveSnapshot() uses peekBreezyCandidatesCache(scan=preview) and fetchBreezyCandidates(scan=preview), bypassing getIngestedCandidatesSnapshot()"
    : ingestedCandidates.length === 0
      ? "src/lib/candidate-ingestion/run-ingestion-sync.ts — ingestion cycle has not populated the durable store"
      : input?.skipLiveBreezyFetch
        ? "src/lib/recruiting-live-snapshot.ts — preview path bypasses ingestion (not exercised in skipLiveBreezyFetch mode)"
        : "none";

  const issueClassification: CandidateSyncDiagnosticReport["issueClassification"] =
    ingestionAheadOfLive
      ? "architecture_split"
      : ingestedCandidates.length === 0
        ? "data_issue"
        : input?.skipLiveBreezyFetch
          ? "architecture_split"
          : "ui_issue";

  const recommendedFix =
    issueClassification === "architecture_split"
      ? "Wire buildRecruitingLiveSnapshot (and Recruiting Command Center preview fetch) to fall back to getIngestedCandidatesSnapshot() when preview/fast caches are empty or undercount relative to the durable ingestion store. Short-term operator workarounds: click Refresh live snapshot after server restart; run POST /api/candidates/ingestion/sync; use /executive/autonomous-operations-command-center for paperwork queue metrics (ingestion-backed)."
      : issueClassification === "data_issue"
        ? "Run POST /api/candidates/ingestion/sync?complete=true and verify .data/candidate-ingestion.json gains candidates."
        : "No code change required — monitor preview cache warming.";

  const opsComponents: CandidateSyncDiagnosticReport["opsComponents"] = [
    {
      phase: "P126",
      name: "Operations Command Center",
      uiVisible: true,
      uiLocation: "/executive/autonomous-operations-command-center",
      apiRoute: "/api/autonomous-operations-center?scope=paperwork",
      apiRouteExists: routeExists("/api/autonomous-operations-center"),
      notes: "Also exposed at /api/autonomous-operations-command-center. Not on Recruiting Command Center tab.",
    },
    {
      phase: "P127",
      name: "End-to-End Preview Drill",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Script/artifact only — no executive panel.",
    },
    {
      phase: "P128",
      name: "Pilot Candidate Selection",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Certification/selection artifact only.",
    },
    {
      phase: "P129",
      name: "Gap Analysis",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Analysis module only.",
    },
    {
      phase: "P130",
      name: "Fix Plan",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Analysis module only.",
    },
    {
      phase: "P131",
      name: "Manual Verification",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Recheck module only.",
    },
    {
      phase: "P132",
      name: "Resume Detection",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Investigation module only.",
    },
    {
      phase: "P133",
      name: "Remaining Blockers",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Blocker report module only.",
    },
    {
      phase: "P134",
      name: "Remediation Engine",
      uiVisible: true,
      uiLocation: "/executive/autonomous-operations-command-center",
      apiRoute: "/api/paperwork-remediation",
      apiRouteExists: routeExists("/api/paperwork-remediation"),
      notes: "Panel on Ops Command Center page.",
    },
    {
      phase: "P135",
      name: "Remediation Executor",
      uiVisible: true,
      uiLocation: "/executive/autonomous-operations-command-center",
      apiRoute: "/api/paperwork-remediation-executor",
      apiRouteExists: routeExists("/api/paperwork-remediation-executor"),
      notes: "Panel on Ops Command Center page.",
    },
    {
      phase: "P136",
      name: "Scheduler",
      uiVisible: true,
      uiLocation: "/executive/autonomous-operations-command-center",
      apiRoute: "/api/autonomous-paperwork-scheduler",
      apiRouteExists: routeExists("/api/autonomous-paperwork-scheduler"),
      notes: "Panel on Ops Command Center page.",
    },
    {
      phase: "P137",
      name: "Readiness Gate",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Gate logic in scripts/P137 artifacts — no dedicated UI panel.",
    },
    {
      phase: "P138",
      name: "Pilot Verification",
      uiVisible: true,
      uiLocation: "/executive/autonomous-operations-command-center",
      apiRoute: "/api/pilot-verification",
      apiRouteExists: routeExists("/api/pilot-verification"),
      notes: "Pilot Verification panel.",
    },
    {
      phase: "P139",
      name: "Operator Runbook",
      uiVisible: false,
      uiLocation: null,
      apiRoute: null,
      apiRouteExists: false,
      notes: "Markdown/JSON runbook artifacts only.",
    },
    {
      phase: "P140",
      name: "Production Health",
      uiVisible: true,
      uiLocation: "/executive/autonomous-operations-command-center",
      apiRoute: "/api/production-health",
      apiRouteExists: routeExists("/api/production-health"),
      notes: "Production Health panel.",
    },
  ];

  return {
    sourcePhase: P142_SOURCE_PHASE,
    generatedAt,
    mode: P142_DIAGNOSTIC_MODE,
    rootCause,
    exactFailingComponent,
    issueClassification,
    recommendedFix,
    ingestionStore: {
      path: ingestionPath,
      candidateCount: ingestedCandidates.length,
      cycleComplete: store.cycleComplete,
      publishedPositionsTotal: store.publishedPositionsTotal,
      scannedPositionCount: store.scannedPositionIds.length,
      positionCoveragePct,
      lastChunkAt: store.lastChunkAt,
      updatedAt: store.updatedAt,
      usableForPaperwork: isIngestionStoreUsable(store),
    },
    cacheLayers,
    apiPaths,
    liveSnapshot: {
      ok: liveSnapshot?.ok ?? false,
      syncStatus: liveSnapshot?.ok ? liveSnapshot.syncStatus : null,
      candidatesPulled: liveCandidatesPulled,
      publishedJobs: liveSnapshot?.ok ? liveSnapshot.jobs.jobs.length : null,
      candidatesFromCache: liveSnapshot?.ok ? liveSnapshot.diagnostics.candidatesFromCache : null,
      kpiSnapshotBuilt: liveSnapshot?.ok ? Boolean(liveSnapshot.kpiSnapshot) : null,
      error: liveSnapshot?.ok === false ? liveSnapshot.error : null,
    },
    commandCenterUi: {
      candidatesPulledLabel: "Candidates pulled",
      dataSourceApi: "/api/recruiting/live-snapshot",
      kpiSnapshotApi: "/api/breezy/candidates?scan=preview (via fetchCommandCenterBreezyData)",
      whyZeroCandidatesPulled:
        "RecruitingDataSourcesPanel displays snapshot.candidates.candidates.length from live-snapshot. That builder uses preview scan only and never reads candidate-ingestion.json. Empty preview results are returned as ok:true with syncStatus partial, so the UI shows 0 instead of —.",
      whyKpiSnapshotMissing:
        "RecruitingCommandCenter builds KPIs only when both fetchCommandCenterBreezyData candidates.ok and jobs.ok are true. A failed or non-ok preview candidates response leaves snapshot null even when jobs loaded — producing 'no KPI snapshot could be built'.",
    },
    paperworkCandidateSource: {
      loader: "loadPaperworkCandidates → readIngestionStore / listIngestedCandidates",
      candidateCount: paperworkContext?.candidateIds.length ?? ingestedCandidates.length,
      sameAsCommandCenterKpi: false,
    },
    opsComponents,
    whyOpsPanelsNotVisibleOnRecruitingTab:
      "The screenshot is the Recruiting Command Center tab (Breezy hiring KPIs). P126–P140 autonomous paperwork panels live on /executive/autonomous-operations-command-center (AppShell link: Ops Command Center), not on /executive or the recruiting dashboard.",
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
    executeBatchCalled: false,
  };
}
