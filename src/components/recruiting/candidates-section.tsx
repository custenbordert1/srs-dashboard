"use client";

import type {
  BreezyCandidate,
  BreezyCandidatesResult,
  BreezyCandidatesSuccess,
  BreezyJobsResult,
} from "@/lib/breezy-api";
import {
  CANDIDATE_WORKFLOW_STATUSES,
  type CandidateWorkflowRecord,
  type CandidateWorkflowStatus,
  type CandidateWorkflowState,
} from "@/lib/candidate-workflow-types";
import { CandidateAutomationPanels } from "@/components/recruiting/candidate-automation-panels";
import {
  CandidateActionsMenu,
  type CandidateRowAction,
} from "@/components/recruiting/candidate-actions-menu";
import { CandidateDetailDrawer } from "@/components/recruiting/candidate-detail-drawer";
import { buildCandidateDrawerRowFromScored } from "@/lib/build-candidate-drawer-row";
import type { RecruitingActionType } from "@/lib/candidate-recruiting-actions";
import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import { paperworkStatusLabel } from "@/lib/candidate-paperwork";
import {
  completeCandidateFollowUp,
  persistRecruitingActionToggle,
  persistWorkflowUpdate,
  snoozeCandidate24h,
} from "@/lib/candidate-workflow-client";
import {
  checkOnboardingSignatureStatus,
  fetchOnboardingConfig,
  sendOnboardingPacket,
} from "@/lib/onboarding-client";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import {
  defaultRecruiterRosters,
  type RecruiterRosters,
} from "@/lib/candidate-workflow-types";
import { VirtualCandidateTable } from "@/components/recruiting/virtual-candidate-table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMelOpportunities } from "@/hooks/use-mel-opportunities";
import { matchCandidateToOpportunities } from "@/lib/mel-matching/matching-engine";
import { AI_GRADE_STYLES, type WorkflowRecommendation } from "@/lib/candidate-ai-scoring";
import { buildPrioritizationQueues } from "@/lib/candidate-prioritization";
import {
  buildBaselineWorkflowRow,
  buildScoredWorkflowRow,
  type ScoredCandidateWorkflowRow,
} from "@/lib/build-candidate-workflow-row";
import { isAppliedDateInRange } from "@/lib/breezy-api";
import { fetchCachedBreezyJobs } from "@/lib/cached-breezy-client";
import {
  CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS,
  CANDIDATES_TAB_LOADING_CEILING_MS,
  fetchAndMergeFastCandidates,
  fetchAndMergeFullCandidates,
  fetchCandidatesForTab,
  peekTabCandidatesCache,
  shouldHydrateFullCandidates,
  type CandidatesTabFetchResult,
} from "@/lib/breezy-candidates-client";
import { candidatePrimaryEmail, hasCandidatePrimaryEmail } from "@/lib/onboarding-signer";
import { logBreezyCandidatesOps } from "@/lib/breezy-candidates-ops-log";
import { logCandidatesClientTrace } from "@/lib/candidates-client-trace";
import {
  logCandidatesDebug,
  logFirstCandidateKeys,
  logRecruiterTerritoryFilters,
} from "@/lib/candidates-debug";
import {
  BREEZY_CANDIDATES_SOURCE,
  buildCandidatesSyncAlert,
  CANDIDATES_WORKFLOW_SOURCE,
  timeoutShowsCachedCandidatesMessage,
} from "@/lib/breezy-candidates-sync";
import { buildJobsByPositionId } from "@/lib/recruiting-intelligence";
import { CandidateMatchBadge } from "@/components/recruiting/candidate-match-badge";
import { cacheKey, fetchCachedJson, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import {
  DASHBOARD_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";
import { buildRecruiterProductivity } from "@/lib/recruiter-productivity";
import { pickActingRecruiter } from "@/lib/recruiter-roster";
import {
  CandidateMyQueuePanel,
} from "@/components/recruiting/candidate-my-queue-panel";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { flushSync } from "react-dom";

const ALL = "__all__";
const selectClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";
const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";
const thClass =
  "sticky top-0 z-10 whitespace-nowrap bg-zinc-900/95 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 backdrop-blur-sm";
const tdClass = "whitespace-nowrap px-2 py-1 text-xs text-zinc-300";

const WORKFLOW_STATUS_STYLES: Record<CandidateWorkflowStatus, string> = {
  Applied: "bg-slate-500/15 text-slate-200 ring-1 ring-slate-500/30",
  "Needs Review": "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30",
  Qualified: "bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30",
  "Not Qualified": "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30",
  "Paperwork Needed": "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
  "Paperwork Sent": "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30",
  Signed: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
  "Ready for MEL": "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30",
  "Loaded in MEL": "bg-green-500/15 text-green-200 ring-1 ring-green-500/30",
  "Training Needed": "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
  "Active Rep": "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
};

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(raw: string): string {
  const date = parseDate(raw);
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function candidateName(candidate: BreezyCandidate): string {
  return `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.email || "Unknown candidate";
}

function sourceBreakdown(candidates: ScoredCandidateWorkflowRow[]): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const source = candidate.source || "Unknown source";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));
}

function workflowBuckets(candidates: ScoredCandidateWorkflowRow[]) {
  return [
    {
      id: "needs-review",
      label: "Needs review",
      rows: candidates.filter((candidate) => candidate.workflowStatus === "Applied" || candidate.workflowStatus === "Needs Review"),
    },
    {
      id: "ready-paperwork",
      label: "Ready for paperwork",
      rows: candidates.filter((candidate) => candidate.workflowStatus === "Qualified" || candidate.workflowStatus === "Paperwork Needed"),
    },
    {
      id: "waiting-signed",
      label: "Waiting on signed paperwork",
      rows: candidates.filter((candidate) => candidate.workflowStatus === "Paperwork Sent"),
    },
    {
      id: "ready-mel",
      label: "Ready to load into MEL",
      rows: candidates.filter((candidate) => candidate.workflowStatus === "Signed" || candidate.workflowStatus === "Ready for MEL"),
    },
    {
      id: "training-needed",
      label: "Needs training",
      rows: candidates.filter((candidate) => candidate.workflowStatus === "Training Needed"),
    },
  ];
}

function daysSince(raw: string | null): number | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const start = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date();
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

function formatDays(days: number | null): string {
  return days === null ? "—" : `${days}d`;
}

function agingTextClass(days: number | null): string {
  if (days === null) return "text-zinc-500";
  if (days <= 3) return "font-medium text-emerald-300";
  if (days <= 7) return "font-medium text-amber-300";
  return "font-medium text-red-300";
}

function AgingValue({ days, label }: { days: number | null; label: string }) {
  return (
    <span className={`block ${agingTextClass(days)}`}>
      {label} {formatDays(days)}
    </span>
  );
}

function RecommendationPills({ items }: { items: WorkflowRecommendation[] }) {
  if (items.length === 0) {
    return <span className="text-[10px] text-zinc-600">—</span>;
  }
  return (
    <div className="flex max-w-[9rem] flex-col gap-0.5">
      {items.slice(0, 2).map((item) => (
        <span
          key={item}
          className="truncate rounded bg-zinc-800/80 px-1 py-0 text-[9px] text-zinc-300 ring-1 ring-zinc-700"
          title={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function CandidatesSection() {
  const { opportunities: melOpportunities, loading: melLoading } = useMelOpportunities();
  /** Rows always render from this — never cleared on timeout/failed refresh. */
  const [breezySnapshot, setBreezySnapshot] = useState<BreezyCandidatesSuccess | null>(null);
  const breezySnapshotRef = useRef<BreezyCandidatesSuccess | null>(null);
  /** Committed immediately on fast/preview — table paints before deferred scoring. */
  const [committedCandidates, setCommittedCandidates] = useState<BreezyCandidate[]>([]);
  const [enrichedCandidates, setEnrichedCandidates] = useState<ScoredCandidateWorkflowRow[]>([]);
  const [workflowEnrichmentPending, setWorkflowEnrichmentPending] = useState(false);
  const hasRenderableCandidateRows = committedCandidates.length > 0;
  const hasCandidateSnapshot = breezySnapshot !== null || committedCandidates.length > 0;
  const [data, setData] = useState<BreezyCandidatesResult | undefined>(undefined);
  const [loadingBundle, setLoadingBundle] = useState(true);
  const [refreshingCandidates, setRefreshingCandidates] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const loadingCeilingHit = useLoadingCeiling(
    loadingBundle && committedCandidates.length === 0,
    CANDIDATES_TAB_LOADING_CEILING_MS,
  );
  const [syncAlert, setSyncAlert] = useState<string | null>(null);
  const [enrichmentWarnings, setEnrichmentWarnings] = useState<string[]>([]);
  const [jobsData, setJobsData] = useState<BreezyJobsResult | undefined>(undefined);
  const [workflowState, setWorkflowState] = useState<CandidateWorkflowState>({});
  const [rosters, setRosters] = useState<RecruiterRosters>(() => defaultRecruiterRosters());
  const [actingRecruiter, setActingRecruiter] = useState(() => pickActingRecruiter(defaultRecruiterRosters()));
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [stageFilter, setStageFilter] = useState(ALL);
  const [positionFilter, setPositionFilter] = useState(ALL);
  const [cityFilter, setCityFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState(ALL);
  const [workflowFilter, setWorkflowFilter] = useState(ALL);
  const [matchFilter, setMatchFilter] = useState(ALL);
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [queueActionBusy, setQueueActionBusy] = useState(false);
  const [onboardingConfigured, setOnboardingConfigured] = useState(false);
  const [onboardingTemplatesAvailable, setOnboardingTemplatesAvailable] = useState(false);
  const [paperworkTemplates, setPaperworkTemplates] = useState<
    Array<{ key: OnboardingTemplateKey; label: string; configured: boolean }>
  >([]);
  const [paperworkSendingId, setPaperworkSendingId] = useState<string | null>(null);

  const hasPopulatedSnapshot = useCallback(
    () =>
      committedCandidates.length > 0 ||
      (breezySnapshotRef.current?.candidates.length ?? 0) > 0,
    [committedCandidates.length],
  );

  const setNonBlockingSyncAlert = useCallback((message: string) => {
    const hasRows = (breezySnapshotRef.current?.candidates.length ?? 0) > 0;
    if (hasRows && message.toLowerCase().includes("timed out")) {
      setSyncAlert("Background sync in progress — table shows last loaded candidates.");
      return;
    }
    setSyncAlert(message);
  }, []);

  const commitCandidatesSuccess = useCallback(
    (
      parsed: BreezyCandidatesSuccess,
      timing?: { fetchDurationMs?: number; normalizeDurationMs?: number },
    ) => {
      const commitStarted = performance.now();
      const priorCount = breezySnapshotRef.current?.candidates.length ?? 0;
      const incomingCount = parsed.candidates.length;
      logCandidatesClientTrace("fast_commit_started", {
        priorSnapshotCount: priorCount,
        incomingCandidateCount: incomingCount,
        incomingScanMode: parsed.scanMode,
        fetchDurationMs: timing?.fetchDurationMs,
        normalizeDurationMs: timing?.normalizeDurationMs,
      });
      if (incomingCount === 0 && priorCount > 0) {
        logCandidatesClientTrace("commitCandidatesSuccess_skipped_empty_overwrite", {
          priorSnapshotCount: priorCount,
          previewEmptyWouldOverwriteFast: true,
        });
        setSyncAlert(buildCandidatesSyncAlert(parsed));
        return;
      }
      logCandidatesDebug("before_commitCandidatesSuccess", incomingCount, {
        commitCandidatesSuccessCalled: true,
        priorSnapshotCount: priorCount,
        willBecomeEmpty: incomingCount === 0,
      });
      logFirstCandidateKeys(
        "before_commitCandidatesSuccess",
        parsed.candidates[0] as unknown as Record<string, unknown> | undefined,
      );
      breezySnapshotRef.current = parsed;
      if (incomingCount > 0) {
        flushSync(() => {
          setCommittedCandidates(parsed.candidates);
          setBreezySnapshot(parsed);
          setData(parsed);
          setLoadingBundle(false);
        });
      } else {
        setCommittedCandidates([]);
        setEnrichedCandidates([]);
        setWorkflowEnrichmentPending(false);
        setBreezySnapshot(parsed);
        setData(parsed);
      }
      const commitDurationMs = Math.round(performance.now() - commitStarted);
      const alert = buildCandidatesSyncAlert(parsed);
      if (incomingCount > 0 && alert?.toLowerCase().includes("timed out")) {
        setSyncAlert("Background sync in progress — table shows last loaded candidates.");
      } else {
        setSyncAlert(alert);
      }
      logCandidatesClientTrace("fast_commit_completed", {
        candidatesStateLength: incomingCount,
        snapshotCandidateCountAfter: parsed.candidates.length,
        commitDurationMs,
        fetchDurationMs: timing?.fetchDurationMs,
        normalizeDurationMs: timing?.normalizeDurationMs,
      });
      logCandidatesDebug("after_commitCandidatesSuccess", incomingCount, {
        commitCandidatesSuccessCalled: true,
        candidatesStateEmpty: incomingCount === 0,
        commitDurationMs,
      });
    },
    [],
  );

  const commitCandidatesFailure = useCallback(
    (parsed: CandidatesTabFetchResult | { error: string; showingCachedSnapshot?: boolean }) => {
      const failureMessage =
        "ok" in parsed ? (parsed.ok ? "Candidate sync failed" : parsed.error) : parsed.error;
      if (hasPopulatedSnapshot()) {
        logBreezyCandidatesOps("client", "fallback", {
          fallbackSource: "ui_committed_rows",
          reason: "suppress_error_fallback_with_loaded_rows",
          committedRowCount: committedCandidates.length,
          snapshotRowCount: breezySnapshotRef.current?.candidates.length ?? 0,
          error: failureMessage,
        });
        setSyncAlert(
          "showingCachedSnapshot" in parsed && parsed.showingCachedSnapshot
            ? failureMessage
            : `${failureMessage} Showing loaded candidates — background sync incomplete.`,
        );
        return;
      }
      if (breezySnapshotRef.current) {
        setSyncAlert(failureMessage);
        return;
      }
      setSyncAlert(null);
      setData({
        ok: false,
        error: failureMessage,
        fetchedAt: new Date().toISOString(),
      });
    },
    [committedCandidates.length, hasPopulatedSnapshot],
  );

  const handlePreviewFetchError = useCallback(
    (err: unknown) => {
      const timedOut = isTimeoutError(err);
      const message = err instanceof Error ? err.message : "Failed to load Breezy candidates";
      if (hasPopulatedSnapshot()) {
        setNonBlockingSyncAlert(
          timedOut
            ? timeoutShowsCachedCandidatesMessage(CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS, true)
            : `${message} Showing loaded candidates — background sync incomplete.`,
        );
        return;
      }
      if (!timedOut) {
        setSyncAlert(null);
        setData({
          ok: false,
          error: message,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }
      commitCandidatesFailure({
        ok: false,
        error: timeoutShowsCachedCandidatesMessage(CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS, false),
        fetchedAt: new Date().toISOString(),
      });
    },
    [commitCandidatesFailure, hasPopulatedSnapshot, setNonBlockingSyncAlert],
  );

  const hydrateRemainingCandidates = useCallback(
    async (base: BreezyCandidatesSuccess) => {
      if (!shouldHydrateFullCandidates(base)) {
        logCandidatesClientTrace("hydrateRemainingCandidates_skipped", {
          hydrationComplete: base.hydrationComplete,
          positionsScanned: base.positionsScanned,
          totalPositionsAvailable: base.totalPositionsAvailable,
        });
        return;
      }
      logCandidatesClientTrace("hydrateRemainingCandidates_start", {
        baseCandidateCount: base.candidates.length,
      });
      setRefreshingCandidates(true);
      try {
        const fetchStarted = performance.now();
        const merged = await fetchAndMergeFullCandidates(base);
        logCandidatesClientTrace("hydrateRemainingCandidates_response", {
          ok: merged.ok,
          candidateCount: merged.ok ? merged.candidates.length : 0,
          fetchDurationMs: Math.round(performance.now() - fetchStarted),
        });
        if (merged.ok) {
          commitCandidatesSuccess(merged, {
            fetchDurationMs: Math.round(performance.now() - fetchStarted),
          });
        }
      } catch {
        // Keep partial rows visible while background sync continues.
      } finally {
        setRefreshingCandidates(false);
      }
    },
    [commitCandidatesSuccess],
  );

  const runFastTier = useCallback(
    async (force: boolean) => {
      setRefreshingCandidates(true);
      const fetchStarted = performance.now();
      try {
        const baseNow = breezySnapshotRef.current;
        const baseCount = baseNow?.candidates.length ?? 0;
        logCandidatesClientTrace("fast_tier_start", {
          baseSnapshotCount: baseCount,
          mergeWithBase: Boolean(baseNow && baseCount > 0),
        });
        const fastMerged =
          baseNow && baseCount > 0
            ? await fetchAndMergeFastCandidates(baseNow, { force })
            : await fetchCandidatesForTab({ force, scan: "fast" });
        const fetchDurationMs = Math.round(performance.now() - fetchStarted);
        logCandidatesClientTrace("fast_tier_response_ui", {
          ok: fastMerged.ok,
          candidateCount: fastMerged.ok ? fastMerged.candidates.length : 0,
          scanMode: fastMerged.ok ? fastMerged.scanMode : undefined,
          fromCache: fastMerged.ok ? fastMerged.fromCache : undefined,
          fetchDurationMs,
        });
        if (fastMerged.ok && fastMerged.candidates.length > 0) {
          commitCandidatesSuccess(fastMerged, { fetchDurationMs });
          if (shouldHydrateFullCandidates(fastMerged)) {
            void hydrateRemainingCandidates(fastMerged);
          }
        } else if (hasPopulatedSnapshot()) {
          logCandidatesClientTrace("fast_tier_empty_keeps_snapshot", {
            fastOk: fastMerged.ok,
            fastCount: fastMerged.ok ? fastMerged.candidates.length : 0,
            refSnapshotCount: breezySnapshotRef.current?.candidates.length ?? 0,
          });
          setNonBlockingSyncAlert(
            fastMerged.ok
              ? "Fast sync returned no new candidates. Showing loaded candidates — background sync continues."
              : `${"error" in fastMerged ? fastMerged.error : "Fast sync failed"} Showing loaded candidates — background sync continues.`,
          );
        }
      } catch (err) {
        if (hasPopulatedSnapshot()) {
          const timedOut = isTimeoutError(err);
          const message = err instanceof Error ? err.message : "Background candidate sync failed";
          setNonBlockingSyncAlert(
            timedOut
              ? "Background sync still running — table shows last loaded candidates."
              : `${message} Showing loaded candidates — background sync continues.`,
          );
        }
      } finally {
        setRefreshingCandidates(false);
      }
    },
    [commitCandidatesSuccess, hasPopulatedSnapshot, hydrateRemainingCandidates, setNonBlockingSyncAlert],
  );

  const loadBundle = useCallback(async (force = false) => {
    const rowsAtStart = breezySnapshotRef.current?.candidates.length ?? 0;
    if (rowsAtStart === 0) setLoadingBundle(true);

    const cached = peekTabCandidatesCache();
    if (cached && cached.candidates.length > 0) {
      logCandidatesClientTrace("cache_peek_commit", { candidateCount: cached.candidates.length });
      logCandidatesDebug("before_cache_peek_commit", cached.candidates.length);
      commitCandidatesSuccess(cached);
      logCandidatesDebug("after_cache_peek_commit", cached.candidates.length);
      setLoadingBundle(false);
    }

    const enrichment: string[] = [];
    let deferredPreviewFailure: CandidatesTabFetchResult | null = null;
    let previewResult: CandidatesTabFetchResult | null = null;

    const fastWork = runFastTier(force);

    try {
      const previewStarted = performance.now();
      const preview = await fetchCandidatesForTab({ force, scan: "preview" });
      previewResult = preview;
      const previewFetchDurationMs = Math.round(performance.now() - previewStarted);
      const priorCount = breezySnapshotRef.current?.candidates.length ?? 0;
      logCandidatesClientTrace("preview_tier_response", {
        ok: preview.ok,
        candidateCount: preview.ok ? preview.candidates.length : 0,
        priorSnapshotCount: priorCount,
        fetchDurationMs: previewFetchDurationMs,
        showingCachedSnapshot: preview.ok ? preview.showingCachedSnapshot : undefined,
      });
      if (preview.ok) {
        logCandidatesDebug("before_preview_fetch_commit", preview.candidates.length, {
          positionsScanned: preview.positionsScanned ?? 0,
          priorSnapshotCount: priorCount,
          willCallCommit: preview.candidates.length > 0,
        });
        logRecruiterTerritoryFilters({
          actingRecruiter,
          sourceFilter,
          workflowFilter,
          stageFilter,
          territoryNote: "Territory filter runs server-side on /api/breezy/candidates (DM role).",
        });
        if (preview.candidates.length > 0) {
          logCandidatesClientTrace("preview_commit", {
            candidateCount: preview.candidates.length,
            fetchDurationMs: previewFetchDurationMs,
            fromCache: preview.fromCache ?? false,
            showingCachedSnapshot: preview.showingCachedSnapshot ?? false,
          });
          commitCandidatesSuccess(preview, { fetchDurationMs: previewFetchDurationMs });
        } else if (priorCount > 0) {
          logCandidatesClientTrace("preview_skip_commit_keeps_snapshot", {
            priorSnapshotCount: priorCount,
            previewEmptyWouldOverwriteFast: true,
          });
          logCandidatesDebug("preview_fetch_skip_commit", 0, {
            reason: "empty_preview_keeps_prior_snapshot",
            priorSnapshotCount: priorCount,
          });
          setSyncAlert(buildCandidatesSyncAlert(preview));
        } else {
          logCandidatesClientTrace("preview_empty_no_prior_snapshot", {
            positionsScanned: preview.positionsScanned ?? 0,
          });
          setSyncAlert(buildCandidatesSyncAlert(preview));
        }
      } else if (hasPopulatedSnapshot()) {
        setNonBlockingSyncAlert(
          `${preview.error} Showing loaded candidates — background sync incomplete.`,
        );
      } else {
        deferredPreviewFailure = preview;
      }
    } catch (err) {
      if (hasPopulatedSnapshot()) {
        handlePreviewFetchError(err);
      } else {
        const timedOut = isTimeoutError(err);
        const message = err instanceof Error ? err.message : "Failed to load Breezy candidates";
        deferredPreviewFailure = {
          ok: false,
          error: timedOut
            ? timeoutShowsCachedCandidatesMessage(CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS, false)
            : message,
          fetchedAt: new Date().toISOString(),
        };
      }
    }

    if ((breezySnapshotRef.current?.candidates.length ?? 0) === 0) {
      logCandidatesClientTrace("await_fast_tier_before_give_up", {
        reason: "no_committed_rows_after_preview",
      });
      await fastWork;
      const stillEmpty = (breezySnapshotRef.current?.candidates.length ?? 0) === 0;
      if (stillEmpty && deferredPreviewFailure) {
        commitCandidatesFailure(deferredPreviewFailure);
      } else if (stillEmpty && previewResult?.ok) {
        setData(previewResult);
        setSyncAlert(buildCandidatesSyncAlert(previewResult));
        logCandidatesClientTrace("sync_complete_empty_ok", {
          positionsScanned: previewResult.positionsScanned ?? 0,
        });
      }
    }

    if ((breezySnapshotRef.current?.candidates.length ?? 0) === 0) {
      setLoadingBundle(false);
    }

    const [jobsSettled, workflowsSettled] = await Promise.allSettled([
      fetchCachedBreezyJobs(),
      fetchCachedJson(
        cacheKey(["candidates", "workflows"]),
        async () => {
          const workflowRes = await fetchWithTimeout(CANDIDATES_WORKFLOW_SOURCE.apiPath, {
            cache: "no-store",
            timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
          });
          return (await workflowRes.json()) as {
            ok: boolean;
            workflows?: CandidateWorkflowState;
            rosters?: RecruiterRosters;
            error?: string;
          };
        },
        { ttlMs: LONG_CLIENT_CACHE_TTL_MS, label: "candidate-workflows", staleOnError: true },
      ),
    ]);

    if (jobsSettled.status === "fulfilled" && jobsSettled.value.ok) {
      setJobsData(jobsSettled.value);
    } else {
      const jobsErr =
        jobsSettled.status === "rejected"
          ? jobsSettled.reason instanceof Error
            ? jobsSettled.reason.message
            : "Breezy jobs request failed"
          : !jobsSettled.value.ok
            ? jobsSettled.value.error
            : "Breezy jobs unavailable";
      enrichment.push(`Job enrichment unavailable (${jobsErr}) — position match fields may be limited.`);
    }

    if (workflowsSettled.status === "fulfilled" && workflowsSettled.value.ok) {
      if (workflowsSettled.value.workflows) {
        setWorkflowState(workflowsSettled.value.workflows);
      }
      if (workflowsSettled.value.rosters) {
        setRosters(workflowsSettled.value.rosters);
        setActingRecruiter((current) =>
          workflowsSettled.value.rosters!.recruiters.includes(current)
            ? current
            : pickActingRecruiter(workflowsSettled.value.rosters!),
        );
      }
    } else {
      const wfErr =
        workflowsSettled.status === "rejected"
          ? isTimeoutError(workflowsSettled.reason)
            ? timeoutErrorMessage("Candidate workflows", DASHBOARD_REQUEST_TIMEOUT_MS)
            : workflowsSettled.reason instanceof Error
              ? workflowsSettled.reason.message
              : "Workflow request failed"
          : "Workflow overlay unavailable";
      enrichment.push(`${wfErr} (${CANDIDATES_WORKFLOW_SOURCE.label}) — using Breezy stage only.`);
    }

    setEnrichmentWarnings(enrichment);
  }, [
    commitCandidatesFailure,
    commitCandidatesSuccess,
    committedCandidates.length,
    handlePreviewFetchError,
    hasPopulatedSnapshot,
    runFastTier,
    setNonBlockingSyncAlert,
  ]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadBundle(), 0);
    return () => window.clearTimeout(id);
  }, [loadBundle]);

  useEffect(() => {
    logCandidatesClientTrace("candidates_state_after_render", {
      breezySnapshotCount: breezySnapshot?.candidates.length ?? 0,
      committedCandidateCount: committedCandidates.length,
      enrichedRowCount: enrichedCandidates.length,
      dataOk: data?.ok,
      dataCandidateCount: data?.ok ? data.candidates.length : 0,
      hasRenderableCandidateRows,
      loadingBundle,
      refreshingCandidates,
      workflowEnrichmentPending,
    });
  }, [
    breezySnapshot,
    committedCandidates.length,
    data,
    enrichedCandidates.length,
    hasRenderableCandidateRows,
    loadingBundle,
    refreshingCandidates,
    workflowEnrichmentPending,
  ]);

  useEffect(() => {
    void fetchOnboardingConfig()
      .then((config) => {
        setOnboardingConfigured(config.configured);
        setOnboardingTemplatesAvailable(config.templatesAvailable);
        setPaperworkTemplates(
          config.templates.map((t) => ({
            key: t.key as OnboardingTemplateKey,
            label: t.label,
            configured: t.configured,
          })),
        );
      })
      .catch(() => {
        setOnboardingConfigured(false);
        setOnboardingTemplatesAvailable(false);
        setPaperworkTemplates([]);
      });
  }, []);

  const retry = useCallback(() => {
    setRetrying(true);
    void loadBundle(true).finally(() => setRetrying(false));
  }, [loadBundle]);

  const jobsByPositionId = useMemo(
    () => (jobsData?.ok ? buildJobsByPositionId(jobsData.jobs) : new Map()),
    [jobsData],
  );

  useEffect(() => {
    if (committedCandidates.length === 0) {
      return;
    }

    const enrichmentStarted = performance.now();
    logCandidatesClientTrace("workflow_enrichment_started", {
      snapshotCandidateCount: committedCandidates.length,
    });

    const timerId = window.setTimeout(() => {
      setWorkflowEnrichmentPending(true);
      startTransition(() => {
        const rows = committedCandidates.map((candidate) => {
          const job = jobsByPositionId.get(candidate.positionId);
          return buildScoredWorkflowRow(candidate, workflowState[candidate.candidateId], { job });
        });
        const enrichmentDurationMs = Math.round(performance.now() - enrichmentStarted);
        setEnrichedCandidates(rows);
        setWorkflowEnrichmentPending(false);
        logCandidatesClientTrace("workflow_enrichment_completed", {
          workflowEnrichedRowCount: rows.length,
          enrichmentDurationMs,
        });
        logCandidatesClientTrace("table_rows_committed", {
          tableRowsCommittedToState: rows.length,
          enrichmentDurationMs,
        });
      });
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [committedCandidates, jobsByPositionId, workflowState]);

  const candidates = useMemo(() => {
    if (enrichedCandidates.length > 0) {
      return enrichedCandidates;
    }
    return committedCandidates.map((candidate) =>
      buildBaselineWorkflowRow(candidate, workflowState[candidate.candidateId]),
    );
  }, [committedCandidates, enrichedCandidates, workflowState]);
  const sourceOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.source)), [candidates]);
  const stageOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.stage)), [candidates]);
  const positionOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.positionName)), [candidates]);
  const cityOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.city)), [candidates]);
  const stateOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.state)), [candidates]);

  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const candidate of candidates) {
      index.set(
        candidate.candidateId,
        [
          candidateName(candidate),
          candidate.email,
          candidate.phone,
          candidate.positionName,
          candidate.source,
          candidate.stage,
          candidate.city,
          candidate.state,
        ]
          .join(" ")
          .toLowerCase(),
      );
    }
    return index;
  }, [candidates]);

  const filtered = useMemo(() => {
    logCandidatesDebug("before_table_filter", candidates.length);
    logRecruiterTerritoryFilters({
      actingRecruiter,
      sourceFilter,
      workflowFilter,
      stageFilter,
      territoryNote: "Main table filters are client-side only (not recruiter assignment).",
    });
    const q = debouncedSearch.trim().toLowerCase();

    const rows = candidates.filter((candidate) => {
      if (sourceFilter !== ALL && candidate.source !== sourceFilter) return false;
      if (stageFilter !== ALL && candidate.stage !== stageFilter) return false;
      if (positionFilter !== ALL && candidate.positionName !== positionFilter) return false;
      if (cityFilter !== ALL && candidate.city !== cityFilter) return false;
      if (stateFilter !== ALL && candidate.state !== stateFilter) return false;
      if (workflowFilter !== ALL && candidate.workflowStatus !== workflowFilter) return false;
      if (matchFilter !== ALL && candidate.matchLevel !== matchFilter) return false;

      if (appliedFrom && appliedTo) {
        if (!isAppliedDateInRange(candidate.appliedDate, appliedFrom, appliedTo)) return false;
      } else if (appliedFrom || appliedTo) {
        const appliedDate = parseDate(candidate.appliedDate);
        if (appliedFrom) {
          const fromDate = new Date(`${appliedFrom}T00:00:00`);
          if (!appliedDate || appliedDate < fromDate) return false;
        }
        if (appliedTo) {
          const toDate = new Date(`${appliedTo}T23:59:59`);
          if (!appliedDate || appliedDate > toDate) return false;
        }
      }
      if (q) {
        const haystack = searchIndex.get(candidate.candidateId);
        if (!haystack?.includes(q)) return false;
      }

      return true;
    });

    const sorted = [...rows].sort(
      (a, b) =>
        b.matchPercent - a.matchPercent ||
        b.ai.numericScore - a.ai.numericScore ||
        candidateName(a).localeCompare(candidateName(b)),
    );
    logCandidatesClientTrace("table_render_state", {
      tableRowsCommittedToState: sorted.length,
      hasRenderableCandidateRows,
      snapshotCandidateCount: breezySnapshot?.candidates.length ?? 0,
      workflowEnrichedRowCount: candidates.length,
      activeFilters: {
        sourceFilter,
        stageFilter,
        positionFilter,
        cityFilter,
        stateFilter,
        workflowFilter,
        matchFilter,
        appliedFrom: appliedFrom || null,
        appliedTo: appliedTo || null,
        debouncedSearch: debouncedSearch || null,
      },
    });
    logCandidatesDebug("after_table_filter", sorted.length, {
      tableRowsCommittedToState: sorted.length,
      snapshotCandidates: breezySnapshot?.candidates.length ?? 0,
    });
    logFirstCandidateKeys(
      "after_table_filter",
      sorted[0] as unknown as Record<string, unknown> | undefined,
    );
    return sorted;
  }, [
    actingRecruiter,
    appliedFrom,
    appliedTo,
    breezySnapshot?.candidates.length,
    candidates,
    cityFilter,
    debouncedSearch,
    matchFilter,
    positionFilter,
    searchIndex,
    sourceFilter,
    stageFilter,
    stateFilter,
    workflowFilter,
  ]);

  const filteredIds = useMemo(() => filtered.map((candidate) => candidate.candidateId), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((candidateId) => selectedIds.has(candidateId));

  const newestApplicantDate = useMemo(() => {
    const newest = filtered
      .map((candidate) => parseDate(candidate.appliedDate))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return newest ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(newest) : "—";
  }, [filtered]);

  const breakdown = useMemo(() => sourceBreakdown(filtered), [filtered]);
  const buckets = useMemo(() => workflowBuckets(filtered), [filtered]);
  const statusCounts = useMemo(
    () =>
      CANDIDATE_WORKFLOW_STATUSES.map((status) => ({
        status,
        count: filtered.filter((candidate) => candidate.workflowStatus === status).length,
      })),
    [filtered],
  );

  const selectedCandidate = useMemo(
    () => (selectedCandidateId ? (candidates.find((c) => c.candidateId === selectedCandidateId) ?? null) : null),
    [candidates, selectedCandidateId],
  );

  const selectedDrawerRow = useMemo(() => {
    if (!selectedCandidate) return null;
    const row = buildCandidateDrawerRowFromScored(selectedCandidate);
    const breezy = breezySnapshot?.candidates.find(
      (c) => c.candidateId === selectedCandidate.candidateId,
    );
    if (!breezy || melOpportunities.length === 0) return row;
    const melMatch = matchCandidateToOpportunities(breezy, melOpportunities);
    return {
      ...row,
      matchedOpportunities: melMatch.matches,
      melMatchingSummary: melMatch.aiSummary,
    };
  }, [breezySnapshot, melOpportunities, selectedCandidate]);

  const prioritizationQueues = useMemo(
    () =>
      buildPrioritizationQueues(
        candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          name: candidateName(candidate),
          positionName: candidate.positionName,
          workflowStatus: candidate.workflowStatus,
          assignedRecruiter: candidate.assignedRecruiter,
          appliedDate: candidate.appliedDate,
          appliedDays: daysSince(candidate.appliedDate),
          ai: candidate.ai,
        })),
      ),
    [candidates],
  );

  const recruiterProductivity = useMemo(() => buildRecruiterProductivity(workflowState), [workflowState]);

  function toggleWorkflowStatusFilter(status: CandidateWorkflowStatus) {
    setWorkflowFilter((current) => (current === status ? ALL : status));
  }

  async function persistWorkflow(
    candidate: ScoredCandidateWorkflowRow,
    workflowStatus: CandidateWorkflowStatus,
    options: { note?: string; assignedRecruiter?: string; assignedDM?: string } = {},
  ): Promise<CandidateWorkflowRecord> {
    const res = await fetch("/api/candidates/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateId: candidate.candidateId,
        workflowStatus,
        assignedRecruiter: options.assignedRecruiter ?? candidate.assignedRecruiter,
        assignedDM: options.assignedDM ?? candidate.assignedDM,
        note: options.note,
      }),
    });
    const parsed = (await res.json()) as {
      ok: boolean;
      workflow?: CandidateWorkflowRecord;
      workflows?: CandidateWorkflowState;
      rosters?: RecruiterRosters;
      error?: string;
    };
    if (!res.ok || !parsed.ok || !parsed.workflow) {
      throw new Error(parsed.error ?? `Workflow update failed with HTTP ${res.status}`);
    }
    invalidateCached(cacheKey(["candidates", "workflows"]));
    if (parsed.workflows) setWorkflowState(parsed.workflows);
    if (parsed.rosters) setRosters(parsed.rosters);
    return parsed.workflow;
  }

  function applyWorkflowRecord(workflow: CandidateWorkflowRecord) {
    setWorkflowState((prev) => ({ ...prev, [workflow.candidateId]: workflow }));
  }

  function applyRosters(next: RecruiterRosters) {
    setRosters(next);
    setActingRecruiter((current) =>
      next.recruiters.includes(current) ? current : pickActingRecruiter(next),
    );
  }

  function persistRecruitingAction(candidateId: string, type: RecruitingActionType) {
    void persistRecruitingActionToggle(candidateId, type)
      .then((workflow) => {
        applyWorkflowRecord(workflow);
        invalidateCached(cacheKey(["candidates", "workflows"]));
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Recruiting action update failed");
      });
  }

  const sendPaperwork = useCallback(
    (candidate: ScoredCandidateWorkflowRow, templateKey: OnboardingTemplateKey) => {
      const recipientEmail = candidatePrimaryEmail(candidate);
      if (!recipientEmail) {
        window.alert("Candidate email is required to send Dropbox Sign paperwork.");
        return;
      }
      setPaperworkSendingId(candidate.candidateId);
      void sendOnboardingPacket({
        candidateId: candidate.candidateId,
        candidateName: candidateName(candidate),
        candidateEmail: recipientEmail,
        email: candidate.email,
        email_address:
          (candidate as BreezyCandidate & { email_address?: string }).email_address ?? candidate.email,
        templateKey,
      })
        .then((result) => {
          if (result.workflow) applyWorkflowRecord(result.workflow);
          invalidateCached(cacheKey(["candidates", "workflows"]));
        })
        .catch((err) => {
          window.alert(err instanceof Error ? err.message : "Send paperwork failed");
        })
        .finally(() => setPaperworkSendingId(null));
    },
    [],
  );

  const refreshPaperworkStatus = useCallback((candidate: ScoredCandidateWorkflowRow) => {
    if (!candidate.signatureRequestId) return;
    void checkOnboardingSignatureStatus(candidate.signatureRequestId)
      .then((result) => {
        if (result.workflow) applyWorkflowRecord(result.workflow);
        invalidateCached(cacheKey(["candidates", "workflows"]));
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Paperwork status check failed");
      });
  }, []);

  const handleQueueAction = useCallback(
    (candidateId: string, payload: CandidateQueueActionPayload) => {
      const row = candidates.find((c) => c.candidateId === candidateId);
      if (!row) return;
      setQueueActionBusy(true);
      const finish = (workflow: CandidateWorkflowRecord) => {
        applyWorkflowRecord(workflow);
        invalidateCached(cacheKey(["candidates", "workflows"]));
      };
      const run = async () => {
        switch (payload.action) {
          case "assign-recruiter":
            finish(
              await persistWorkflowUpdate({
                candidateId,
                assignedRecruiter: payload.recruiter,
                workflowStatus: row.workflowStatus,
              }),
            );
            break;
          case "assign-dm":
            finish(
              await persistWorkflowUpdate({
                candidateId,
                assignedDM: payload.dm,
                workflowStatus: row.workflowStatus,
              }),
            );
            break;
          case "apply-suggested-dm":
            finish(
              await persistWorkflowUpdate({
                candidateId,
                assignedDM: row.suggestedDM,
                workflowStatus: row.workflowStatus,
              }),
            );
            break;
          case "complete-follow-up":
            finish(await completeCandidateFollowUp(candidateId));
            break;
          case "snooze-24h":
            finish(await snoozeCandidate24h(candidateId));
            break;
          case "move-paperwork":
            finish(
              await persistWorkflowUpdate({
                candidateId,
                workflowStatus: "Paperwork Needed",
              }),
            );
            break;
          case "ready-mel":
            finish(
              await persistWorkflowUpdate({
                candidateId,
                workflowStatus: "Ready for MEL",
              }),
            );
            break;
          default:
            break;
        }
      };
      void run()
        .catch((err) => {
          window.alert(err instanceof Error ? err.message : "Queue action failed");
        })
        .finally(() => setQueueActionBusy(false));
    },
    [candidates],
  );

  function updateWorkflow(
    candidate: ScoredCandidateWorkflowRow,
    workflowStatus: CandidateWorkflowStatus,
    options: { note?: string; assignedRecruiter?: string; assignedDM?: string } = {},
  ) {
    void persistWorkflow(candidate, workflowStatus, options)
      .then(applyWorkflowRecord)
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Workflow update failed");
      });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  }

  const toggleSelectCandidate = useCallback((candidateId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }, []);

  async function runBulkUpdate(
    options: { workflowStatus?: CandidateWorkflowStatus; assignedRecruiter?: string; note?: string },
  ) {
    const rows = candidates.filter((candidate) => selectedIds.has(candidate.candidateId));
    if (rows.length === 0) return;
    setBulkBusy(true);
    try {
      const workflows = await Promise.all(
        rows.map((candidate) =>
          persistWorkflow(candidate, options.workflowStatus ?? candidate.workflowStatus, {
            assignedRecruiter: options.assignedRecruiter,
            note: options.note,
          }),
        ),
      );
      setWorkflowState((prev) => {
        const next = { ...prev };
        for (const workflow of workflows) next[workflow.candidateId] = workflow;
        return next;
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Bulk workflow update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  const handleCandidateAction = useCallback(
    (candidate: ScoredCandidateWorkflowRow, action: CandidateRowAction) => {
      if (action.kind === "open-drawer") {
        setSelectedCandidateId(candidate.candidateId);
        return;
      }
      if (action.kind === "change-workflow") {
        updateWorkflow(candidate, action.status);
        return;
      }
      if (action.kind === "assign-recruiter") {
        updateWorkflow(candidate, candidate.workflowStatus, { assignedRecruiter: action.recruiter });
        return;
      }
      if (action.kind === "assign-dm") {
        updateWorkflow(candidate, candidate.workflowStatus, { assignedDM: action.dm });
        return;
      }
      if (action.kind === "send-paperwork") {
        sendPaperwork(candidate, action.templateKey);
        return;
      }
      updateWorkflow(candidate, candidate.workflowStatus, { note: action.note });
    },
    [sendPaperwork],
  );

  const renderCandidateRow = useCallback(
    (candidate: ScoredCandidateWorkflowRow) => {
      const appliedDays = daysSince(candidate.appliedDate);
      const statusDays = daysSince(candidate.lastActionAt ?? candidate.appliedDate);
      const rowSelected = selectedCandidateId === candidate.candidateId;
      return (
        <tr
          key={candidate.candidateId}
          onClick={() => setSelectedCandidateId(candidate.candidateId)}
          className={`cursor-pointer transition-colors ${
            rowSelected ? "bg-teal-500/10 hover:bg-teal-500/15" : "hover:bg-zinc-800/40"
          }`}
          style={{ height: 34 }}
        >
          <td className={tdClass} onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              aria-label={`Select ${candidateName(candidate)}`}
              checked={selectedIds.has(candidate.candidateId)}
              onChange={() => toggleSelectCandidate(candidate.candidateId)}
            />
          </td>
          <td className={`${tdClass} max-w-[10rem] truncate font-medium text-zinc-100`}>{candidateName(candidate)}</td>
          <td className={`${tdClass} max-w-[12rem] truncate`}>{candidate.email || "—"}</td>
          <td className={tdClass}>{candidate.phone || "—"}</td>
          <td className={`${tdClass} max-w-[8rem] truncate text-zinc-400`}>{candidate.source || "—"}</td>
          <td className={`${tdClass} max-w-[8rem] truncate`}>{candidate.stage || "—"}</td>
          <td className={`${tdClass} text-zinc-400`}>{formatDate(candidate.appliedDate)}</td>
          <td className={`${tdClass} max-w-[10rem] truncate`}>{candidate.positionName || "—"}</td>
          <td className={tdClass}>{candidate.city || "—"}</td>
          <td className={tdClass}>{candidate.state || "—"}</td>
          <td className={tdClass}>
            <span
              className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-tight ${WORKFLOW_STATUS_STYLES[candidate.workflowStatus]}`}
            >
              {candidate.workflowStatus}
            </span>
          </td>
          <td className={`${tdClass} text-[10px]`}>
            <AgingValue days={appliedDays} label="Applied" />
            <AgingValue days={statusDays} label="Status" />
          </td>
          <td className={`${tdClass} max-w-[12rem]`}>
            <div className="truncate text-zinc-300">{candidate.nextActionNeeded}</div>
            <div className="mt-0.5 truncate text-[10px] text-zinc-500">
              {candidate.assignedRecruiter} · {candidate.assignedDM}
            </div>
          </td>
          <td className={tdClass} onClick={(event) => event.stopPropagation()}>
            <CandidateActionsMenu
              rosters={rosters}
              onRostersUpdated={applyRosters}
              onAction={(action) => handleCandidateAction(candidate, action)}
              onboardingConfigured={onboardingConfigured}
              templatesAvailable={onboardingTemplatesAvailable}
              paperworkTemplates={paperworkTemplates}
              hasCandidateEmail={hasCandidatePrimaryEmail(candidate)}
              sendPaperworkDisabled={paperworkSendingId === candidate.candidateId}
            />
          </td>
          <td className={`${tdClass} text-zinc-500 underline-offset-2 hover:underline`} title="Open candidate drawer">
            Notes: {candidate.notes.length}
          </td>
          <td className={tdClass} onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-zinc-500" title={candidate.paperworkError ?? undefined}>
                {paperworkStatusLabel(candidate.paperworkStatus)}
              </span>
              <button
                type="button"
                disabled={
                  !onboardingTemplatesAvailable ||
                  !onboardingConfigured ||
                  !hasCandidatePrimaryEmail(candidate) ||
                  paperworkSendingId === candidate.candidateId
                }
                title={
                  !onboardingTemplatesAvailable
                    ? "No onboarding templates configured in .env.local"
                    : !onboardingConfigured
                      ? "Configure DROPBOX_SIGN_API_KEY in .env.local"
                      : !hasCandidatePrimaryEmail(candidate)
                        ? "Candidate email missing"
                        : "Send onboarding packet (Dropbox Sign)"
                }
                onClick={() => sendPaperwork(candidate, "onboarding_packet")}
                className="rounded border border-zinc-700 bg-zinc-950/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200 hover:bg-zinc-800 disabled:text-zinc-600"
              >
                {paperworkSendingId === candidate.candidateId ? "Sending…" : "Send"}
              </button>
              {candidate.signatureRequestId ? (
                <button
                  type="button"
                  className="text-[10px] text-teal-400/90 hover:underline"
                  onClick={() => refreshPaperworkStatus(candidate)}
                >
                  Refresh
                </button>
              ) : null}
            </div>
          </td>
          <td className={tdClass} title={candidate.intelligenceSummary}>
            <CandidateMatchBadge
              matchPercent={candidate.matchPercent}
              matchLevel={candidate.matchLevel}
              isTopMatch={candidate.isTopMatch}
              compact
            />
          </td>
          <td className={`${tdClass} max-w-[8rem] truncate text-[10px] text-zinc-500`} title={candidate.skillTags.join(", ")}>
            {candidate.skillTags.length > 0 ? candidate.skillTags.slice(0, 2).join(", ") : "—"}
          </td>
          <td className={tdClass}>
            <span
              className={`inline-flex min-w-[2rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${AI_GRADE_STYLES[candidate.aiGrade]}`}
            >
              {candidate.aiGrade}
            </span>
          </td>
          <td className={tdClass}>
            <RecommendationPills items={candidate.aiRecommendations} />
          </td>
        </tr>
      );
    },
    [
      handleCandidateAction,
      onboardingConfigured,
      onboardingTemplatesAvailable,
      paperworkSendingId,
      paperworkTemplates,
      refreshPaperworkStatus,
      rosters,
      selectedCandidateId,
      selectedIds,
      sendPaperwork,
      toggleSelectCandidate,
    ],
  );

  if (loadingBundle && !hasRenderableCandidateRows) {
    return (
      <DashboardSectionFallback
        title="Candidates"
        loadingMessage="Loading first Breezy candidates, jobs, and workflow overlay…"
        isLoading
        loadingCeilingHit={loadingCeilingHit}
        onRetry={retry}
        retrying={retrying}
        skeletonRows={3}
        skeletonCards={3}
      />
    );
  }

  if (!hasRenderableCandidateRows && data !== undefined && !data.ok) {
    return (
      <DashboardSectionFallback
        title="Candidates"
        error={data.error}
        timedOut={data.error.toLowerCase().includes("timed out")}
        onRetry={retry}
        retrying={retrying}
      />
    );
  }

  if (hasCandidateSnapshot && !hasRenderableCandidateRows && !refreshingCandidates && !loadingBundle) {
    return (
      <DashboardSectionFallback
        title="Candidates"
        isEmpty
        emptyMessage="No candidates in the latest Breezy sync. Try refresh after sync completes."
        onRetry={retry}
        retrying={retrying}
      />
    );
  }

  const syncData = data?.ok ? data : breezySnapshot;

  return (
    <div className="space-y-6">
      {syncAlert && !(hasRenderableCandidateRows && syncAlert.toLowerCase().includes("timed out")) ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
        >
          {syncAlert}
        </p>
      ) : null}
      {hasRenderableCandidateRows && (refreshingCandidates || syncAlert) ? (
        <p className="rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-100">
          Background sync in progress — {committedCandidates.length.toLocaleString()} candidates loaded
        </p>
      ) : null}
      {enrichmentWarnings.length > 0 ? (
        <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
          {enrichmentWarnings.join(" ")}
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Candidates</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500">
              Live Breezy candidates with merchandising resume intelligence, travel-radius scoring, and match filters. Breezy sync stays read-only.
            </p>
            <p className="mt-2 text-xs text-zinc-600">
              Source: <span className="text-zinc-500">{BREEZY_CANDIDATES_SOURCE.label}</span>
              <span className="text-zinc-700"> · {BREEZY_CANDIDATES_SOURCE.apiPath}</span>
            </p>
            {syncData ? (
              <p className="mt-1 text-xs text-zinc-600">
                Last sync: {new Date(syncData.fetchedAt).toLocaleString()}
                {syncData.fromCache ? " · server cache" : " · live"}
                {syncData.stale ? " · stale (refresh failed)" : ""}
                {syncData.partial ? " · partial sync" : ""}
                {syncData.candidates.length > 0
                  ? ` · ${syncData.candidates.length.toLocaleString()} candidates`
                  : ""}
                {syncData.positionsScanned != null && syncData.totalPositionsAvailable != null
                  ? ` · ${syncData.positionsScanned}/${syncData.totalPositionsAvailable} positions scanned`
                  : ""}
                {refreshingCandidates ? " · sync in progress…" : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              disabled={refreshingCandidates}
              onClick={() => void loadBundle(true)}
              className="rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-600/20 disabled:opacity-50"
            >
              {refreshingCandidates ? "Syncing…" : "Refresh / Sync"}
            </button>
            {syncData ? (
              <p className="text-xs text-zinc-500">Fetched {formatDate(syncData.fetchedAt)}</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Candidates shown" value={filtered.length.toLocaleString()} hint={`${candidates.length.toLocaleString()} loaded`} />
        <SummaryCard label="Newest applicant" value={newestApplicantDate} />
        <SummaryCard
          label="Top sources"
          value={breakdown.length > 0 ? breakdown.map((row) => `${row.source}: ${row.count}`).join(" · ") : "—"}
        />
      </div>

      <CandidateMyQueuePanel
        candidates={candidates}
        rosters={rosters}
        actingRecruiter={actingRecruiter}
        onActingRecruiterChange={setActingRecruiter}
        onOpenCandidate={setSelectedCandidateId}
        onQueueAction={handleQueueAction}
        queueActionBusy={queueActionBusy}
        syncPartial={Boolean(syncData?.partial)}
        syncStale={Boolean(syncData?.stale)}
      />

      <CandidateAutomationPanels
        queues={prioritizationQueues}
        productivity={recruiterProductivity}
        onOpenCandidate={setSelectedCandidateId}
      />

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Workflow Buckets</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Visibility layer for review, paperwork, MEL loading, and training readiness. Counts use local workflow status when set, otherwise Breezy stage names.
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {buckets.map((bucket) => (
            <div key={bucket.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-200">{bucket.label}</p>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-200">
                  {bucket.rows.length}
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-zinc-500">
                {bucket.rows.slice(0, 3).map((candidate) => (
                  <li key={candidate.candidateId} className="truncate">
                    {candidateName(candidate)} · {candidate.positionName}
                  </li>
                ))}
                {bucket.rows.length === 0 ? <li>No candidates</li> : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Workflow Status Counts</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Local lifecycle statuses for candidate workflow triage. These do not write back to Breezy, HelloSign, or MEL.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {statusCounts.map((row) => {
            const active = workflowFilter === row.status;
            return (
              <button
                key={row.status}
                type="button"
                onClick={() => toggleWorkflowStatusFilter(row.status)}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-teal-500/50 bg-teal-500/10 ring-1 ring-teal-500/30"
                    : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-600 hover:bg-zinc-900/60"
                }`}
              >
                <p className="text-xs text-zinc-500">{row.status}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{row.count}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="sticky top-0 z-20 space-y-2 border-b border-zinc-800/80 bg-zinc-900/95 px-3 py-2 backdrop-blur-sm sm:px-4">
          <input
            className={inputClass}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, position, or source"
          />
          {search.trim() !== debouncedSearch.trim() ? (
            <p className="text-[10px] text-zinc-600">Filtering…</p>
          ) : null}
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-teal-500/30 bg-teal-500/5 px-2 py-1.5">
              <span className="text-[11px] font-medium text-teal-200">{selectedIds.size} selected</span>
              <select
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-200"
                defaultValue=""
                disabled={bulkBusy}
                onChange={(event) => {
                  const status = event.target.value as CandidateWorkflowStatus | "";
                  if (!status) return;
                  void runBulkUpdate({ workflowStatus: status });
                  event.target.value = "";
                }}
              >
                <option value="">Bulk set status…</option>
                {CANDIDATE_WORKFLOW_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-200"
                defaultValue=""
                disabled={bulkBusy}
                onChange={(event) => {
                  const recruiter = event.target.value;
                  if (!recruiter) return;
                  void runBulkUpdate({ assignedRecruiter: recruiter });
                  event.target.value = "";
                }}
              >
                <option value="">Bulk assign recruiter…</option>
                {rosters.recruiters.map((recruiter) => (
                  <option key={recruiter} value={recruiter}>
                    {recruiter}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() =>
                  void runBulkUpdate({
                    workflowStatus: "Paperwork Needed",
                    note: "Bulk paperwork prep queued",
                  })
                }
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-500/20"
              >
                Bulk paperwork prep
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => {
                  const note = window.prompt("Note to add for all selected candidates:");
                  if (!note?.trim()) return;
                  void runBulkUpdate({ note: note.trim() });
                }}
                className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                Bulk add note
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setSelectedIds(new Set())}
                className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                Clear
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">
          <select className={selectClass} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value={ALL}>All sources</option>
            {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
          <select className={selectClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value={ALL}>All stages</option>
            {stageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          <select className={selectClass} value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
            <option value={ALL}>All positions</option>
            {positionOptions.map((position) => <option key={position} value={position}>{position}</option>)}
          </select>
          <select className={selectClass} value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
            <option value={ALL}>All cities</option>
            {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
          <select className={selectClass} value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value={ALL}>All states</option>
            {stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
          <input className={inputClass} type="date" value={appliedFrom} onChange={(event) => setAppliedFrom(event.target.value)} aria-label="Applied from date" />
          <input className={inputClass} type="date" value={appliedTo} onChange={(event) => setAppliedTo(event.target.value)} aria-label="Applied to date" />
            <select className={selectClass} value={workflowFilter} onChange={(event) => setWorkflowFilter(event.target.value)}>
              <option value={ALL}>All workflow statuses</option>
              {CANDIDATE_WORKFLOW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={matchFilter}
              onChange={(event) => setMatchFilter(event.target.value)}
              aria-label="Filter by match level"
            >
              <option value={ALL}>All match levels</option>
              <option value="high">High match</option>
              <option value="medium">Medium match</option>
              <option value="low">Low match</option>
              <option value="no_resume">No resume</option>
            </select>
          </div>
        </div>

        {refreshingCandidates || workflowEnrichmentPending ? (
          <p className="border-b border-teal-500/20 bg-teal-950/20 px-3 py-1.5 text-center text-[11px] text-teal-200/80 sm:px-4">
            {workflowEnrichmentPending && !refreshingCandidates
              ? "Enriching candidate scores — table shows loaded rows"
              : "Refreshing Breezy candidates — table stays visible"}
          </p>
        ) : null}
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-xs text-zinc-500 sm:px-4">No candidates match the selected filters.</p>
        ) : (
          <VirtualCandidateTable
            rows={filtered}
            colSpan={20}
            getRowKey={(candidate) => candidate.candidateId}
            renderRow={(candidate) => renderCandidateRow(candidate)}
            header={
              <thead className="border-b border-zinc-800/80">
                <tr>
                  <th className={thClass}>
                    <input
                      type="checkbox"
                      aria-label="Select all filtered candidates"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </th>
                  <th className={thClass}>Name</th>
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Phone</th>
                  <th className={thClass}>Source</th>
                  <th className={thClass}>Stage</th>
                  <th className={thClass}>Applied</th>
                  <th className={thClass}>Position</th>
                  <th className={thClass}>City</th>
                  <th className={thClass}>State</th>
                  <th className={thClass}>Workflow</th>
                  <th className={thClass}>Aging</th>
                  <th className={thClass}>Next Action</th>
                  <th className={thClass}>Actions</th>
                  <th className={thClass}>Notes</th>
                  <th className={thClass}>HelloSign</th>
                  <th className={thClass}>Match</th>
                  <th className={thClass}>Skills</th>
                  <th className={thClass}>AI Grade</th>
                  <th className={thClass}>Recommendations</th>
                </tr>
              </thead>
            }
          />
        )}
      </section>

      <CandidateDetailDrawer
        key={selectedDrawerRow?.candidateId ?? "closed"}
        candidate={selectedDrawerRow}
        open={selectedDrawerRow !== null}
        onClose={() => setSelectedCandidateId(null)}
        statusAgingDays={
          selectedDrawerRow ? daysSince(selectedDrawerRow.lastActionAt ?? selectedDrawerRow.appliedDate) : null
        }
        appliedAgingDays={selectedDrawerRow ? daysSince(selectedDrawerRow.appliedDate) : null}
        onStatusChange={(status) => {
          if (!selectedCandidate) return;
          updateWorkflow(selectedCandidate, status);
        }}
        onSaveAssignments={(assignedRecruiter, assignedDM) => {
          if (!selectedCandidate) return;
          updateWorkflow(selectedCandidate, selectedCandidate.workflowStatus, { assignedRecruiter, assignedDM });
        }}
        onAddNote={(note) => {
          if (!selectedCandidate) return;
          updateWorkflow(selectedCandidate, selectedCandidate.workflowStatus, { note });
        }}
        rosters={rosters}
        onRostersUpdated={applyRosters}
        onRecruitingAction={(type: RecruitingActionType) => {
          if (!selectedCandidate) return;
          persistRecruitingAction(selectedCandidate.candidateId, type);
        }}
        onboardingConfigured={onboardingConfigured}
        templatesAvailable={onboardingTemplatesAvailable}
        paperworkTemplates={paperworkTemplates}
        paperworkSending={paperworkSendingId === selectedCandidate?.candidateId}
        onSendPaperwork={(templateKey) => {
          if (!selectedCandidate) return;
          sendPaperwork(selectedCandidate, templateKey);
        }}
        onRefreshPaperworkStatus={() => {
          if (!selectedCandidate) return;
          refreshPaperworkStatus(selectedCandidate);
        }}
        melMatchesLoading={melLoading}
      />
    </div>
  );
}
