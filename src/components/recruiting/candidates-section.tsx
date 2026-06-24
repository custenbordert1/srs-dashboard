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
import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import type { CandidateRowAction } from "@/components/recruiting/candidate-actions-menu";
import { CandidateWorkspace } from "@/components/recruiting/candidate-workspace";
import { CandidateAssignmentBadge } from "@/components/recruiting/candidate-assignment-badge";
import { buildCandidateDrawerRowFromScored } from "@/lib/build-candidate-drawer-row";
import type { RecruitingActionType } from "@/lib/candidate-recruiting-actions";
import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import { paperworkStatusLabel } from "@/lib/candidate-paperwork";
import {
  completeCandidateFollowUp,
  persistRecruitingActionToggle,
  persistWorkflowUpdate,
  runCandidateAutomation,
  runCandidateIngestionSync,
  fetchCandidateWorkflowBundle,
  snoozeCandidate24h,
} from "@/lib/candidate-workflow-client";
import {
  checkOnboardingSignatureStatus,
  fetchOnboardingConfig,
  isOnboardingRequestError,
  sendOnboardingPacket,
} from "@/lib/onboarding-client";
import {
  mergeWorkflowStateByUpdatedAt,
  patchEnrichedRowsFromWorkflow,
  syncEnrichedRowsFromWorkflowState,
} from "@/lib/patch-enriched-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import {
  workflowNoticeAssigned,
  workflowNoticePacketSent,
  workflowNoticePaperworkSigned,
  workflowNoticeStatus,
} from "@/lib/workflow-action-notices";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import {
  defaultRecruiterRosters,
  type RecruiterRosters,
} from "@/lib/candidate-workflow-types";
import {
  CANDIDATE_TABLE_ROW_HEIGHT_PX,
} from "@/components/recruiting/virtual-candidate-table";
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
import {
  CANDIDATE_QUEUE_SCOPE_LABELS,
  candidateQueueScopeHint,
  filterCandidatesByQueueScope,
  isHistoricalApplicant,
  type CandidateQueueScope,
} from "@/lib/candidate-ingestion/candidate-queue-scope";
import { fetchCachedBreezyJobs } from "@/lib/cached-breezy-client";
import {
  CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS,
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
import {
  CANDIDATE_INTELLIGENCE_FILTERS,
  matchesCandidateIntelligenceFilter,
  type CandidateIntelligenceFilterId,
} from "@/lib/candidate-readiness";
import { RecruiterActionCenterHero } from "@/components/recruiting/recruiter-action-center-hero";
import { RecruiterInbox } from "@/components/recruiting/recruiter-inbox";
import { CandidatesAdminDiagnostics } from "@/components/recruiting/candidates-admin-diagnostics";
import { ACTION_PRIORITY_STYLES } from "@/lib/recruiter-action-engine/action-sort";
import { progressionBadgeStyle } from "@/lib/candidate-progression-engine/progression-sort";
import {
  buildRecruiterInboxSections,
  computeRecruiterAgingBucket,
  queueParamToInboxSection,
  RECRUITER_AGING_BUCKET_LABELS,
  sortByRecruiterInboxPriority,
  type RecruiterAgingBucket,
  type RecruiterInboxSectionId,
} from "@/lib/recruiter-action-queue-filters";
import { parsePipelineQueueParam } from "@/lib/pipeline-intelligence/client";
import {
  buildCandidateSlaSnapshot,
  isFollowUpOverdue,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import {
  ATTENTION_CUE_STYLES,
  buildRowAttentionCues,
} from "@/lib/candidate-row-attention-cues";
import { buildRecruiterFitSignals } from "@/lib/recruiter-candidate-intelligence";
import {
  formatRecruiterBackgroundSyncLine,
  formatRecruiterSyncAlert,
  formatRecruiterCandidatesSyncHeader,
} from "@/lib/recruiter-sync-status-copy";
import { RecentDdBackfillQueue } from "@/components/recruiting/recent-dd-backfill-queue";
import { CandidateRowPrimaryActionBar } from "@/components/recruiting/candidate-row-primary-action";
import {
  stickyCheckboxCellClass,
  stickyCheckboxHeaderClass,
  stickyIdentityCellClass,
  stickyIdentityHeaderClass,
} from "@/lib/candidate-table-sticky";
import {
  getSendPaperworkBlockReason,
  logSendPaperworkEligibility,
  sendPaperworkBlockMessage,
  type SendPaperworkEligibilityInput,
} from "@/lib/onboarding-send-eligibility";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { useLoadingCeiling, EXECUTIVE_PANEL_LOADING_CEILING_MS } from "@/hooks/use-loading-ceiling";
import { friendlyFetchMessageFromError, sanitizeFriendlyFetchMessage } from "@/lib/friendly-fetch-errors";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

const ALL = "__all__";
const selectClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";
const thClass =
  "sticky top-0 z-10 whitespace-nowrap bg-zinc-900/95 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 backdrop-blur-sm";
/** Keep in sync with `CANDIDATE_TABLE_ROW_HEIGHT_PX` (54). */
const tdClass =
  "max-h-[54px] align-middle overflow-hidden whitespace-nowrap px-1.5 py-0 text-xs text-zinc-300";
const workflowPillClass =
  "inline-flex h-5 max-w-full items-center truncate rounded-full px-1.5 text-[10px] font-medium leading-none";
const syncBannerClass =
  "rounded-lg border px-3 text-sm leading-snug";
const syncBannerSlotClass = "min-h-[2.75rem]";

const WORKFLOW_STATUS_STYLES: Record<CandidateWorkflowStatus, string> = {
  Applied: "bg-slate-500/15 text-slate-200 ring-1 ring-slate-500/30",
  "Needs Review": "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30",
  Qualified: "bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30",
  "Not Qualified": "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30",
  "Paperwork Needed": "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
  "Paperwork Sent": "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30",
  Signed: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
  "Awaiting DD Verification": "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30",
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
  return formatCandidateDisplayName({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    fallback: "Unknown candidate",
  });
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

function agingBucketTextClass(bucket: RecruiterAgingBucket): string {
  if (bucket === "fresh") return "font-medium text-emerald-300";
  if (bucket === "24h") return "font-medium text-amber-300";
  return "font-medium text-red-300";
}

function StatusTouchAging({ candidate }: { candidate: ScoredCandidateWorkflowRow }) {
  const bucket = computeRecruiterAgingBucket(candidate);
  return (
    <span className={agingBucketTextClass(bucket)}>
      Touch {RECRUITER_AGING_BUCKET_LABELS[bucket]}
    </span>
  );
}

const CandidateRowAttentionBadges = memo(function CandidateRowAttentionBadges({
  candidate,
}: {
  candidate: ScoredCandidateWorkflowRow;
}) {
  const cues = buildRowAttentionCues(candidate);
  return (
    <div className="mt-0.5 h-3.5 overflow-hidden" aria-hidden={cues.length === 0}>
      <div className="flex h-3.5 items-center gap-0.5 overflow-hidden">
        {cues.map((cue) => (
          <span
            key={cue.id}
            className={`inline-flex h-3.5 shrink-0 items-center truncate rounded-full border px-1 text-[9px] font-medium leading-none ${ATTENTION_CUE_STYLES[cue.id]}`}
            title={cue.label}
          >
            {cue.label}
          </span>
        ))}
      </div>
    </div>
  );
});

const CandidateRowFitSignals = memo(function CandidateRowFitSignals({
  candidate,
}: {
  candidate: ScoredCandidateWorkflowRow;
}) {
  const signals = buildRecruiterFitSignals(candidate, 2);
  if (signals.length === 0) return null;
  return (
    <p className="mt-0.5 h-3 overflow-hidden text-[9px] leading-none text-zinc-500">
      <span className="truncate" title={signals.map((s) => s.label).join(" · ")}>
        {signals.map((s) => s.label).join(" · ")}
      </span>
    </p>
  );
});

function tableRowUrgencyClass(candidate: ScoredCandidateWorkflowRow): string {
  const sla = buildCandidateSlaSnapshot({
    appliedDate: candidate.appliedDate,
    workflowStatus: candidate.workflowStatus,
    lastActionAt: candidate.lastActionAt,
    recruitingActions: candidate.recruitingActions,
    followUpDueAt: candidate.followUpDueAt,
    snoozedUntil: candidate.snoozedUntil,
  });
  if (sla.followUpOverdue || candidate.recruitingActions.needsFollowUp) {
    return "border-l-2 border-l-red-500/70";
  }
  if (
    isPaperworkPendingStatus(candidate.workflowStatus) &&
    candidate.paperworkStatus !== "signed"
  ) {
    return "border-l-2 border-l-amber-500/60";
  }
  const bucket = computeRecruiterAgingBucket(candidate);
  if (bucket === "3d" || bucket === "7d+") {
    return "border-l-2 border-l-amber-500/40";
  }
  return "border-l-2 border-l-transparent";
}

function workflowStatusPillClass(
  status: CandidateWorkflowStatus,
  candidate: ScoredCandidateWorkflowRow,
): string {
  const overdue = isFollowUpOverdue({
    recruitingActions: candidate.recruitingActions,
    followUpDueAt: candidate.followUpDueAt,
  });
  const base = WORKFLOW_STATUS_STYLES[status];
  if (overdue) return `${base} ring-1 ring-red-500/50`;
  if (candidate.recruitingActions.needsFollowUp) return `${base} ring-1 ring-amber-500/40`;
  return base;
}

function RecruiterCollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left sm:p-5"
        aria-expanded={open}
      >
        <span>
          <span className="text-lg font-semibold tracking-tight text-zinc-50">{title}</span>
          {description ? (
            <span className="mt-1 block text-sm font-normal text-zinc-500">{description}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="border-t border-zinc-800/80 px-4 pb-4 pt-0 sm:px-5 sm:pb-5">{children}</div> : null}
    </section>
  );
}

const RecommendationPills = memo(function RecommendationPills({
  items,
}: {
  items: WorkflowRecommendation[];
}) {
  if (items.length === 0) {
    return <span className="inline-flex h-7 items-center text-[10px] text-zinc-600">—</span>;
  }
  return (
    <div className="flex h-7 max-w-[9rem] flex-col justify-center gap-0.5 overflow-hidden">
      {items.slice(0, 2).map((item) => (
        <span
          key={item}
          className="truncate rounded bg-zinc-800/80 px-1 py-0 text-[9px] leading-none text-zinc-300 ring-1 ring-zinc-700/80"
          title={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
});

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 line-clamp-2 text-2xl font-semibold tracking-tight text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{hint}</p> : null}
    </div>
  );
}

const AUTOMATION_TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);

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
    EXECUTIVE_PANEL_LOADING_CEILING_MS,
  );
  const [syncAlert, setSyncAlert] = useState<string | null>(null);
  const [enrichmentWarnings, setEnrichmentWarnings] = useState<string[]>([]);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const workflowNoticeTimerRef = useRef<number | null>(null);
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
  const [intelligenceFilter, setIntelligenceFilter] = useState(ALL);
  const [queueScope, setQueueScope] = useState<CandidateQueueScope>("mtd");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [queueActionBusy, setQueueActionBusy] = useState(false);
  const [scrollToInboxSection, setScrollToInboxSection] = useState<RecruiterInboxSectionId | null>(
    null,
  );
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [onboardingConfigured, setOnboardingConfigured] = useState(false);
  const [onboardingConfigLoaded, setOnboardingConfigLoaded] = useState(false);
  const [onboardingConfigError, setOnboardingConfigError] = useState<string | null>(null);
  const [onboardingTemplatesAvailable, setOnboardingTemplatesAvailable] = useState(false);
  const [paperworkTemplates, setPaperworkTemplates] = useState<
    Array<{ key: OnboardingTemplateKey; label: string; configured: boolean }>
  >([]);
  const [paperworkSendingId, setPaperworkSendingId] = useState<string | null>(null);
  const [directDepositBusyId, setDirectDepositBusyId] = useState<string | null>(null);

  const hasPopulatedSnapshot = useCallback(
    () =>
      committedCandidates.length > 0 ||
      (breezySnapshotRef.current?.candidates.length ?? 0) > 0,
    [committedCandidates.length],
  );

  const setNonBlockingSyncAlert = useCallback((message: string) => {
    const friendly =
      sanitizeFriendlyFetchMessage(message, "candidates") ??
      friendlyFetchMessageFromError(new Error(message), "candidates");
    if (!friendly) return;
    const hasRows = (breezySnapshotRef.current?.candidates.length ?? 0) > 0;
    if (hasRows && friendly.toLowerCase().includes("longer than expected")) {
      setSyncAlert("Background sync in progress — table shows last loaded candidates.");
      return;
    }
    setSyncAlert(friendly);
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
        setWorkflowState((prev) => mergeWorkflowStateByUpdatedAt(prev, workflowsSettled.value.workflows!));
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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const queue = parsePipelineQueueParam(params.get("queue"));
    if (queue) {
      const section = queueParamToInboxSection(queue);
      if (section) setScrollToInboxSection(section);
    }
    const candidateId = params.get("candidateId");
    if (candidateId) setSelectedCandidateId(candidateId);
  }, []);

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
        setOnboardingConfigError(null);
        setOnboardingConfigured(config.configured);
        setOnboardingTemplatesAvailable(config.templatesAvailable);
        setPaperworkTemplates(
          config.templates.map((t) => ({
            key: t.key as OnboardingTemplateKey,
            label: t.label,
            configured: t.configured,
          })),
        );
        if (process.env.NODE_ENV !== "production") {
          console.debug("[onboarding-send] config_loaded", {
            configured: config.configured,
            templatesAvailable: config.templatesAvailable,
            templates: config.templates.map((t) => ({
              key: t.key,
              configured: t.configured,
            })),
          });
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Onboarding config failed";
        setOnboardingConfigError(message);
        setOnboardingConfigured(false);
        setOnboardingTemplatesAvailable(false);
        setPaperworkTemplates([]);
        if (process.env.NODE_ENV !== "production") {
          console.debug("[onboarding-send] config_failed", { message });
        }
      })
      .finally(() => setOnboardingConfigLoaded(true));
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

  useEffect(() => {
    return () => {
      if (workflowNoticeTimerRef.current !== null) {
        window.clearTimeout(workflowNoticeTimerRef.current);
      }
    };
  }, []);

  const commitWorkflowToView = useCallback(
    (
      workflow: CandidateWorkflowRecord,
      options?: { notice?: string; workflows?: CandidateWorkflowState },
    ) => {
      const workflowRecord = options?.workflows?.[workflow.candidateId] ?? workflow;
      if (options?.workflows) {
        setWorkflowState((prev) => mergeWorkflowStateByUpdatedAt(prev, options.workflows!));
      } else {
        setWorkflowState((prev) => ({ ...prev, [workflow.candidateId]: workflowRecord }));
      }
      const breezy = committedCandidates.find((c) => c.candidateId === workflow.candidateId);
      const job = breezy ? jobsByPositionId.get(breezy.positionId) : undefined;
      setEnrichedCandidates((prev) => {
        if (options?.workflows) {
          return syncEnrichedRowsFromWorkflowState(
            prev,
            options.workflows,
            committedCandidates,
            jobsByPositionId,
          );
        }
        return patchEnrichedRowsFromWorkflow(prev, breezy, workflowRecord, job);
      });
      if (options?.notice) {
        setWorkflowNotice(options.notice);
        if (workflowNoticeTimerRef.current !== null) {
          window.clearTimeout(workflowNoticeTimerRef.current);
        }
        workflowNoticeTimerRef.current = window.setTimeout(() => {
          setWorkflowNotice(null);
          workflowNoticeTimerRef.current = null;
        }, 3500);
      }
      invalidateCached(cacheKey(["candidates", "workflows"]));
    },
    [committedCandidates, jobsByPositionId],
  );

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/candidates/workflows/events");
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          candidateId?: string;
          workflow?: CandidateWorkflowRecord;
          eventType?: string;
        };
        const workflow = payload.workflow;
        if (!workflow?.candidateId) return;
        const notice =
          workflow.paperworkStatus === "signed"
            ? workflowNoticePaperworkSigned()
            : workflow.paperworkStatus === "viewed"
              ? "Paperwork viewed"
              : payload.eventType === "signature_request_all_signed"
                ? workflowNoticePaperworkSigned()
                : undefined;
        commitWorkflowToView(workflow, { notice });
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    return () => source.close();
  }, [commitWorkflowToView]);

  const allCandidates = useMemo(() => {
    if (enrichedCandidates.length > 0) {
      return enrichedCandidates;
    }
    return committedCandidates.map((candidate) =>
      buildBaselineWorkflowRow(candidate, workflowState[candidate.candidateId]),
    );
  }, [committedCandidates, enrichedCandidates, workflowState]);

  const candidates = useMemo(
    () => filterCandidatesByQueueScope(allCandidates, queueScope),
    [allCandidates, queueScope],
  );

  const queueScopeStats = useMemo(() => {
    const ownerUnassignedInScope = candidates.filter((candidate) =>
      isUnassignedRecruiter(candidate.assignedRecruiter),
    ).length;
    const automationUnassignedInScope =
      queueScope === "mtd"
        ? candidates.filter(
            (candidate) =>
              isUnassignedRecruiter(candidate.assignedRecruiter) &&
              !AUTOMATION_TERMINAL_STATUSES.has(candidate.workflowStatus),
          ).length
        : ownerUnassignedInScope;
    return {
      visible: candidates.length,
      totalIngested: allCandidates.length,
      ownerUnassignedInScope,
      automationUnassignedInScope,
      assignedInScope: candidates.length - ownerUnassignedInScope,
    };
  }, [allCandidates.length, candidates, queueScope]);
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

  const inboxSections = useMemo(
    () => buildRecruiterInboxSections(candidates, actingRecruiter),
    [actingRecruiter, candidates],
  );

  const databaseFiltered = useMemo(() => {
    logCandidatesDebug("before_table_filter", candidates.length);
    logRecruiterTerritoryFilters({
      actingRecruiter,
      sourceFilter,
      workflowFilter,
      stageFilter,
      territoryNote: "Database search filters are client-side only (not recruiter assignment).",
    });
    const q = debouncedSearch.trim().toLowerCase();
    const pool = q ? candidates : inboxSections["everything-else"];

    const rows = pool.filter((candidate) => {
      if (sourceFilter !== ALL && candidate.source !== sourceFilter) return false;
      if (stageFilter !== ALL && candidate.stage !== stageFilter) return false;
      if (positionFilter !== ALL && candidate.positionName !== positionFilter) return false;
      if (cityFilter !== ALL && candidate.city !== cityFilter) return false;
      if (stateFilter !== ALL && candidate.state !== stateFilter) return false;
      if (workflowFilter !== ALL && candidate.workflowStatus !== workflowFilter) return false;
      if (matchFilter !== ALL && candidate.matchLevel !== matchFilter) return false;
      if (
        intelligenceFilter !== ALL &&
        !matchesCandidateIntelligenceFilter(candidate, intelligenceFilter as CandidateIntelligenceFilterId)
      ) {
        return false;
      }

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

    const sorted = sortByRecruiterInboxPriority(rows, actingRecruiter);
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
        intelligenceFilter,
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
    inboxSections,
    intelligenceFilter,
    matchFilter,
    positionFilter,
    searchIndex,
    sourceFilter,
    stageFilter,
    stateFilter,
    workflowFilter,
  ]);

  const databaseFilteredIds = useMemo(
    () => databaseFiltered.map((candidate) => candidate.candidateId),
    [databaseFiltered],
  );
  const allDatabaseFilteredSelected =
    databaseFilteredIds.length > 0 &&
    databaseFilteredIds.every((candidateId) => selectedIds.has(candidateId));

  const breakdown = useMemo(() => sourceBreakdown(candidates), [candidates]);
  const buckets = useMemo(() => workflowBuckets(candidates), [candidates]);
  const statusCounts = useMemo(
    () =>
      CANDIDATE_WORKFLOW_STATUSES.map((status) => ({
        status,
        count: candidates.filter((candidate) => candidate.workflowStatus === status).length,
      })),
    [candidates],
  );

  const selectedCandidate = useMemo(
    () => (selectedCandidateId ? (candidates.find((c) => c.candidateId === selectedCandidateId) ?? null) : null),
    [candidates, selectedCandidateId],
  );

  const backfillCandidateNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const candidate of enrichedCandidates) {
      map[candidate.candidateId] = candidateName(candidate);
    }
    return map;
  }, [enrichedCandidates]);

  const applyWorkflowsBundle = useCallback(
    (workflows: CandidateWorkflowState) => {
      setWorkflowState(workflows);
      setEnrichedCandidates((prev) =>
        prev.map((row) => {
          const wf = workflows[row.candidateId];
          if (!wf) return row;
          const breezy = committedCandidates.find((c) => c.candidateId === row.candidateId);
          if (!breezy) return row;
          return buildScoredWorkflowRow(breezy, wf, {
            job: jobsByPositionId.get(breezy.positionId),
          });
        }),
      );
      invalidateCached(cacheKey(["candidates", "workflows"]));
    },
    [committedCandidates, jobsByPositionId],
  );

  useEffect(() => {
    let cancelled = false;
    void runCandidateIngestionSync({ runPipeline: false })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          void runCandidateIngestionSync({ complete: true, runPipeline: false }).catch(() => undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadingBundle || committedCandidates.length === 0) return;
    let cancelled = false;
    void runCandidateAutomation()
      .then(() => fetchCandidateWorkflowBundle())
      .then((parsed) => {
        if (cancelled || !parsed.workflows) return;
        applyWorkflowsBundle(parsed.workflows);
        if (parsed.rosters) {
          setRosters(parsed.rosters);
        }
      })
      .catch(() => {
        // Automation orchestrator is best-effort; manual workflows remain available.
      });
    return () => {
      cancelled = true;
    };
  }, [applyWorkflowsBundle, committedCandidates.length, loadingBundle]);

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

  const handleScrollToInboxSection = useCallback((section: RecruiterInboxSectionId) => {
    setScrollToInboxSection(section);
  }, []);

  const handleWorkspaceAdvance = useCallback(
    async (input: {
      statusChange?: CandidateWorkflowStatus;
      completeFollowUp?: boolean;
      note?: string;
      recruitingAction?: { type: RecruitingActionType; enabled: boolean };
    }) => {
      const row = selectedCandidate;
      if (!row) return;
      setWorkspaceBusy(true);
      try {
        if (input.completeFollowUp) {
          const workflow = await completeCandidateFollowUp(row.candidateId);
          commitWorkflowToView(workflow, { notice: "Follow-up completed." });
        }
        if (input.recruitingAction) {
          const workflow = await persistRecruitingActionToggle(
            row.candidateId,
            input.recruitingAction.type,
            input.recruitingAction.enabled,
          );
          commitWorkflowToView(workflow);
        }
        if (input.statusChange) {
          const result = await persistWorkflow(row, input.statusChange, { note: input.note });
          if (result.rosters) setRosters(result.rosters);
          commitWorkflowToView(result.workflow, {
            notice: workflowNoticeStatus(input.statusChange),
            workflows: result.workflows,
          });
        } else if (input.note && !input.statusChange && !input.completeFollowUp && !input.recruitingAction) {
          updateWorkflow(row, row.workflowStatus, { note: input.note });
        }
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Workspace action failed");
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [commitWorkflowToView, selectedCandidate],
  );

  function toggleWorkflowStatusFilter(status: CandidateWorkflowStatus) {
    setWorkflowFilter((current) => (current === status ? ALL : status));
  }

  async function persistWorkflow(
    candidate: ScoredCandidateWorkflowRow,
    workflowStatus: CandidateWorkflowStatus,
    options: { note?: string; assignedRecruiter?: string; assignedDM?: string } = {},
  ): Promise<{
    workflow: CandidateWorkflowRecord;
    workflows?: CandidateWorkflowState;
    rosters?: RecruiterRosters;
  }> {
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
    return {
      workflow: parsed.workflow,
      workflows: parsed.workflows,
      rosters: parsed.rosters,
    };
  }

  async function runDirectDepositAction(
    candidate: ScoredCandidateWorkflowRow,
    action: "resend" | "mark-received" | "mark-approved" | "set-notes",
    payload?: { notes?: string },
  ) {
    setDirectDepositBusyId(candidate.candidateId);
    try {
      const res = await fetch("/api/onboarding/direct-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.candidateId,
          action,
          notes: payload?.notes,
          candidateEmail: candidatePrimaryEmail(candidate),
        }),
      });
      const parsed = (await res.json()) as {
        ok: boolean;
        workflow?: CandidateWorkflowRecord;
        error?: string;
      };
      if (!res.ok || !parsed.ok || !parsed.workflow) {
        throw new Error(parsed.error ?? `Direct deposit action failed (${res.status})`);
      }
      const notice =
        action === "resend"
          ? "Direct deposit verification email sent."
          : action === "mark-received"
            ? "Marked direct deposit received."
            : action === "mark-approved"
              ? "Direct deposit approved (manual)."
              : "Payroll notes saved.";
      commitWorkflowToView(parsed.workflow, { notice });
    } finally {
      setDirectDepositBusyId(null);
    }
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
        commitWorkflowToView(workflow);
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Recruiting action update failed");
      });
  }

  const buildSendEligibility = useCallback(
    (
      candidate: ScoredCandidateWorkflowRow,
      templateKey: OnboardingTemplateKey,
      sendBusy: boolean,
    ): SendPaperworkEligibilityInput => ({
      candidate,
      templateKey,
      onboardingConfigured,
      onboardingConfigLoaded,
      onboardingConfigError,
      paperworkTemplates,
      sendBusy,
    }),
    [
      onboardingConfigured,
      onboardingConfigLoaded,
      onboardingConfigError,
      paperworkTemplates,
    ],
  );

  const sendPaperwork = useCallback(
    (candidate: ScoredCandidateWorkflowRow, templateKey: OnboardingTemplateKey) => {
      const eligibility = buildSendEligibility(
        candidate,
        templateKey,
        paperworkSendingId === candidate.candidateId,
      );
      const blockReason = getSendPaperworkBlockReason(eligibility);
      if (blockReason) {
        logSendPaperworkEligibility("send_blocked_click", eligibility);
        window.alert(sendPaperworkBlockMessage(blockReason, eligibility));
        return;
      }
      const recipientEmail = candidatePrimaryEmail(candidate);
      if (!recipientEmail) {
        window.alert(sendPaperworkBlockMessage("missing_email", eligibility));
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
          if (result.workflow) {
            commitWorkflowToView(result.workflow, { notice: workflowNoticePacketSent() });
          }
        })
        .catch((err) => {
          if (isOnboardingRequestError(err) && err.workflow) {
            commitWorkflowToView(err.workflow);
          }
          window.alert(err instanceof Error ? err.message : "Send paperwork failed");
        })
        .finally(() => setPaperworkSendingId(null));
    },
    [buildSendEligibility, commitWorkflowToView, paperworkSendingId],
  );

  const refreshPaperworkStatus = useCallback((candidate: ScoredCandidateWorkflowRow) => {
    if (!candidate.signatureRequestId) return;
    void checkOnboardingSignatureStatus(candidate.signatureRequestId)
      .then((result) => {
        if (!result.workflow) return;
        const signed =
          result.workflow.paperworkStatus === "signed" ||
          result.workflow.workflowStatus === "Signed";
        commitWorkflowToView(result.workflow, {
          notice: signed ? workflowNoticePaperworkSigned() : undefined,
        });
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Paperwork status check failed");
      });
  }, [commitWorkflowToView]);

  const handleQueueAction = useCallback(
    (candidateId: string, payload: CandidateQueueActionPayload) => {
      const row = candidates.find((c) => c.candidateId === candidateId);
      if (!row) return;
      setQueueActionBusy(true);
      const finish = (workflow: CandidateWorkflowRecord, notice?: string) => {
        commitWorkflowToView(workflow, { notice });
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
              workflowNoticeAssigned(payload.recruiter),
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
          case "mark-follow-up":
            finish(await persistRecruitingActionToggle(candidateId, "needs-follow-up", true));
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
              workflowNoticeStatus("Paperwork Needed"),
            );
            break;
          case "ready-mel":
            finish(
              await persistWorkflowUpdate({
                candidateId,
                workflowStatus: "Ready for MEL",
              }),
              workflowNoticeStatus("Ready for MEL"),
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
    [candidates, commitWorkflowToView],
  );

  function updateWorkflow(
    candidate: ScoredCandidateWorkflowRow,
    workflowStatus: CandidateWorkflowStatus,
    options: { note?: string; assignedRecruiter?: string; assignedDM?: string } = {},
  ) {
    const prevStatus = candidate.workflowStatus;
    const assignNotice =
      options.assignedRecruiter &&
      options.assignedRecruiter !== candidate.assignedRecruiter
        ? workflowNoticeAssigned(options.assignedRecruiter)
        : undefined;
    void persistWorkflow(candidate, workflowStatus, options)
      .then((result) => {
        if (result.rosters) setRosters(result.rosters);
        const statusNotice =
          workflowStatus !== prevStatus ? workflowNoticeStatus(workflowStatus) : undefined;
        commitWorkflowToView(result.workflow, {
          notice: statusNotice ?? assignNotice,
          workflows: result.workflows,
        });
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Workflow update failed");
      });
  }

  function toggleSelectAllDatabaseFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allDatabaseFilteredSelected) {
        for (const id of databaseFilteredIds) next.delete(id);
      } else {
        for (const id of databaseFilteredIds) next.add(id);
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
      const results = await Promise.all(
        rows.map((candidate) =>
          persistWorkflow(candidate, options.workflowStatus ?? candidate.workflowStatus, {
            assignedRecruiter: options.assignedRecruiter,
            note: options.note,
          }),
        ),
      );
      const statusNotice =
        options.workflowStatus != null
          ? workflowNoticeStatus(options.workflowStatus)
          : options.assignedRecruiter
            ? workflowNoticeAssigned(options.assignedRecruiter)
            : undefined;
      for (const result of results) {
        if (result.rosters) setRosters(result.rosters);
        commitWorkflowToView(result.workflow, {
          notice: results.length === 1 ? statusNotice : undefined,
          workflows: result.workflows,
        });
      }
      if (results.length > 1 && statusNotice) {
        setWorkflowNotice(statusNotice);
        if (workflowNoticeTimerRef.current !== null) {
          window.clearTimeout(workflowNoticeTimerRef.current);
        }
        workflowNoticeTimerRef.current = window.setTimeout(() => {
          setWorkflowNotice(null);
          workflowNoticeTimerRef.current = null;
        }, 3500);
      }
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

  const flagCandidateFollowUp = useCallback((candidateId: string) => {
    void persistRecruitingActionToggle(candidateId, "needs-follow-up", true)
      .then((workflow) => {
        commitWorkflowToView(workflow);
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Follow-up flag failed");
      });
  }, [commitWorkflowToView]);

  const completeCandidateFollowUpRow = useCallback((candidateId: string) => {
    void completeCandidateFollowUp(candidateId)
      .then((workflow) => {
        commitWorkflowToView(workflow);
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Follow-up complete failed");
      });
  }, [commitWorkflowToView]);

  const assignRecruiterToRow = useCallback(
    (candidate: ScoredCandidateWorkflowRow, recruiter: string) => {
      if (isUnassignedRecruiter(recruiter)) {
        window.alert("Choose an acting recruiter (not Unassigned) before assigning ownership.");
        return;
      }
      setWorkspaceBusy(true);
      void persistWorkflow(candidate, candidate.workflowStatus, { assignedRecruiter: recruiter })
        .then((result) => {
          if (result.rosters) {
            setRosters(result.rosters);
          }
          commitWorkflowToView(result.workflow, {
            notice: workflowNoticeAssigned(recruiter),
            workflows: result.workflows,
          });
        })
        .catch((err) => {
          window.alert(err instanceof Error ? err.message : "Assign recruiter failed");
        })
        .finally(() => setWorkspaceBusy(false));
    },
    [commitWorkflowToView],
  );

  const assignActingRecruiterToRow = useCallback(
    (candidate: ScoredCandidateWorkflowRow) => {
      assignRecruiterToRow(candidate, actingRecruiter);
    },
    [actingRecruiter, assignRecruiterToRow],
  );

  const addQuickNoteToRow = useCallback(
    (candidate: ScoredCandidateWorkflowRow) => {
      const note = window.prompt("Add local workflow note");
      if (!note?.trim()) return;
      updateWorkflow(candidate, candidate.workflowStatus, { note: note.trim() });
    },
    [updateWorkflow],
  );

  const renderCandidateRow = useCallback(
    (candidate: ScoredCandidateWorkflowRow) => {
      const appliedDays = daysSince(candidate.appliedDate);
      const rowSelected = selectedCandidateId === candidate.candidateId;
      const location = [candidate.city, candidate.state].filter(Boolean).join(", ") || "—";
      const urgencyClass = tableRowUrgencyClass(candidate);
      return (
        <tr
          key={candidate.candidateId}
          onClick={() => setSelectedCandidateId(candidate.candidateId)}
          className={`group cursor-pointer ${urgencyClass} ${
            rowSelected
              ? "bg-teal-500/8 hover:bg-teal-500/12 ring-1 ring-inset ring-teal-500/25"
              : "hover:bg-zinc-800/30"
          }`}
          style={{ height: CANDIDATE_TABLE_ROW_HEIGHT_PX, maxHeight: CANDIDATE_TABLE_ROW_HEIGHT_PX }}
          aria-selected={rowSelected}
        >
          <td
            className={stickyCheckboxCellClass(tdClass, {
              selected: rowSelected,
              rowBg: "bg-zinc-950",
            })}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              aria-label={`Select ${candidateName(candidate)}`}
              checked={selectedIds.has(candidate.candidateId)}
              onChange={() => toggleSelectCandidate(candidate.candidateId)}
            />
          </td>
            <td
              className={`${stickyIdentityCellClass(tdClass, {
                selected: rowSelected,
                rowBg: "bg-zinc-950",
              })} !whitespace-normal`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium text-zinc-100">{candidateName(candidate)}</span>
                {candidate.recruiterAssignmentSource ? (
                  <CandidateAssignmentBadge
                    source={candidate.recruiterAssignmentSource}
                    reason={candidate.recruiterAssignmentReason}
                    confidence={candidate.recruiterAssignmentConfidence}
                    compact
                  />
                ) : null}
                <span
                  className={`${workflowPillClass} shrink-0 ${workflowStatusPillClass(candidate.workflowStatus, candidate)}`}
                  title={candidate.workflowStatus}
                >
                  {candidate.workflowStatus}
                </span>
                {candidate.recommendedStage ? (
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${progressionBadgeStyle(candidate.recommendedStage, candidate.progressionPriority)}`}
                    title={candidate.progressionReason ?? candidate.recommendedStage}
                  >
                    {candidate.recommendedStage}
                  </span>
                ) : null}
                {isHistoricalApplicant(candidate) ? (
                  <span
                    className="shrink-0 rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-100"
                    title="Outside current MTD automation window"
                  >
                    Historical
                  </span>
                ) : null}
              </div>
            </td>
            <td className={`${tdClass} truncate text-zinc-400`}>{location}</td>
            <td className={`${tdClass} tabular-nums text-zinc-400`}>{formatDays(appliedDays)}</td>
            <td className={tdClass}>
              <div className="flex min-w-0 items-center gap-1.5">
                <div
                  className="truncate text-sm font-medium text-teal-50/95"
                  title={candidate.actionReason ?? candidate.nextActionNeeded}
                >
                  {candidate.nextActionNeeded}
                </div>
                {candidate.actionPriority ? (
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTION_PRIORITY_STYLES[candidate.actionPriority]}`}
                  >
                    {candidate.actionPriority}
                  </span>
                ) : null}
              </div>
            </td>
            <td className={`${tdClass} truncate text-zinc-400`}>
              {candidate.assignedRecruiter?.trim() || "Unassigned"}
            </td>
            <td className={tdClass} onClick={(event) => event.stopPropagation()}>
              <CandidateRowPrimaryActionBar
                primary={{
                  kind: "open-drawer",
                  label: "Open",
                  tone: "neutral",
                  title: "Open candidate workspace",
                }}
                onPrimary={() => setSelectedCandidateId(candidate.candidateId)}
                followUpDisabled={candidate.recruitingActions.needsFollowUp}
                onFollowUp={() => flagCandidateFollowUp(candidate.candidateId)}
                onFollowUpDone={() => completeCandidateFollowUpRow(candidate.candidateId)}
                onSend={() => sendPaperwork(candidate, "onboarding_packet")}
                onNote={() => addQuickNoteToRow(candidate)}
                onAssignMe={() => assignActingRecruiterToRow(candidate)}
                sendBusy={paperworkSendingId === candidate.candidateId}
                sendDisabled={
                  getSendPaperworkBlockReason(
                    buildSendEligibility(
                      candidate,
                      "onboarding_packet",
                      paperworkSendingId === candidate.candidateId,
                    ),
                  ) !== null
                }
                onOverflowAction={(action) => handleCandidateAction(candidate, action)}
                rosters={rosters}
                onRostersUpdated={applyRosters}
                onboardingConfigured={onboardingConfigured}
                onboardingConfigLoaded={onboardingConfigLoaded}
                onboardingConfigError={onboardingConfigError}
                templatesAvailable={onboardingTemplatesAvailable}
                paperworkTemplates={paperworkTemplates}
                hasCandidateEmail={hasCandidatePrimaryEmail(candidate)}
              />
            </td>
          </tr>
      );
    },
    [
      handleCandidateAction,
      onboardingConfigured,
      onboardingConfigLoaded,
      onboardingConfigError,
      onboardingTemplatesAvailable,
      paperworkSendingId,
      paperworkTemplates,
      rosters,
      actingRecruiter,
      selectedCandidateId,
      selectedIds,
      addQuickNoteToRow,
      assignActingRecruiterToRow,
      buildSendEligibility,
      completeCandidateFollowUpRow,
      flagCandidateFollowUp,
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
        friendlyContext="candidates"
      />
    );
  }

  if (!hasRenderableCandidateRows && data !== undefined && !data.ok) {
    return (
      <DashboardSectionFallback
        title="Candidates"
        error={data.error}
        timedOut={
          data.error.toLowerCase().includes("timed out") ||
          data.error.toLowerCase().includes("longer than expected")
        }
        onRetry={retry}
        retrying={retrying}
        friendlyContext="candidates"
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

  const showSyncAlert =
    Boolean(syncAlert) &&
    !(hasRenderableCandidateRows && syncAlert?.toLowerCase().includes("timed out"));
  const showBackgroundSyncLine =
    hasRenderableCandidateRows && (refreshingCandidates || syncAlert);
  const syncHeaderLine = syncData
    ? formatRecruiterCandidatesSyncHeader({
        candidateCount: syncData.candidates.length,
        fetchedAt: syncData.fetchedAt,
        fromCache: syncData.fromCache,
        stale: syncData.stale,
        partial: syncData.partial,
        positionsScanned: syncData.positionsScanned,
        totalPositionsAvailable: syncData.totalPositionsAvailable,
        refreshing: refreshingCandidates,
      })
    : null;

  const paperworkTemplateWarning =
    onboardingConfigLoaded &&
    onboardingConfigured &&
    !paperworkTemplates.some((t) => t.key === "onboarding_packet" && t.configured);

  const candidateTableHeader = (
    <>
      <colgroup>
        <col className="w-[56px]" />
        <col className="w-[22%]" />
        <col className="w-[14%]" />
        <col className="w-[8%]" />
        <col className="w-[24%]" />
        <col className="w-[12%]" />
        <col className="w-[14%]" />
      </colgroup>
      <thead className="border-b border-zinc-800/60">
        <tr>
          <th className={stickyCheckboxHeaderClass(thClass)}>
            <input
              type="checkbox"
              aria-label="Select all database candidates"
              checked={allDatabaseFilteredSelected}
              onChange={toggleSelectAllDatabaseFiltered}
              onClick={(event) => event.stopPropagation()}
            />
          </th>
          <th className={stickyIdentityHeaderClass(thClass)}>Name</th>
          <th className={thClass}>Location</th>
          <th className={thClass}>Age</th>
          <th className={thClass}>Next action</th>
          <th className={thClass}>Owner</th>
          <th className={thClass}>Action</th>
        </tr>
      </thead>
    </>
  );

  const databaseToolbar = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Queue scope</span>
          {(Object.keys(CANDIDATE_QUEUE_SCOPE_LABELS) as CandidateQueueScope[]).map((scope) => {
            const active = queueScope === scope;
            return (
              <button
                key={scope}
                type="button"
                onClick={() => setQueueScope(scope)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-teal-500/50 bg-teal-500/10 text-teal-100"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
                }`}
              >
                {CANDIDATE_QUEUE_SCOPE_LABELS[scope]}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] tabular-nums text-zinc-400">
          {queueScopeStats.visible.toLocaleString()} visible · {queueScopeStats.assignedInScope.toLocaleString()}{" "}
          assigned · {queueScopeStats.automationUnassignedInScope.toLocaleString()} unassigned
          {queueScope === "mtd" &&
          queueScopeStats.ownerUnassignedInScope !== queueScopeStats.automationUnassignedInScope
            ? ` (${queueScopeStats.ownerUnassignedInScope.toLocaleString()} owner unassigned incl. terminal)`
            : null}
          {queueScope !== "all" ? ` · ${queueScopeStats.totalIngested.toLocaleString()} ingested total` : null}
        </p>
      </div>
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
            onClick={() => setSelectedIds(new Set())}
            className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            Clear
          </button>
        </div>
      ) : null}
      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">Advanced filters</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <select className={selectClass} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value={ALL}>All sources</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <select className={selectClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value={ALL}>All stages</option>
            {stageOptions.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={positionFilter}
            onChange={(event) => setPositionFilter(event.target.value)}
          >
            <option value={ALL}>All positions</option>
            {positionOptions.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
          <select className={selectClass} value={matchFilter} onChange={(event) => setMatchFilter(event.target.value)}>
            <option value={ALL}>All match levels</option>
            <option value="high">High match</option>
            <option value="medium">Medium match</option>
            <option value="low">Low match</option>
            <option value="no_resume">No resume</option>
          </select>
          <select
            className={selectClass}
            value={intelligenceFilter}
            onChange={(event) => setIntelligenceFilter(event.target.value)}
          >
            <option value={ALL}>All intelligence filters</option>
            {CANDIDATE_INTELLIGENCE_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </details>
    </>
  );

  return (
    <div className="space-y-6">
      {workflowNotice ? (
        <p
          role="status"
          className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-100"
        >
          {workflowNotice}
        </p>
      ) : null}

      <RecruiterActionCenterHero
        actingRecruiter={actingRecruiter}
        rosters={rosters}
        onActingRecruiterChange={setActingRecruiter}
      />

      <div
        className={`flex min-h-[1.75rem] items-center justify-center rounded-lg border px-3 ${
          refreshingCandidates || workflowEnrichmentPending
            ? "border-teal-500/15 bg-teal-950/15"
            : "border-transparent bg-transparent"
        }`}
        aria-live="polite"
      >
        <p
          className={`text-center text-[11px] leading-tight text-teal-200/80 ${
            refreshingCandidates || workflowEnrichmentPending ? "" : "invisible"
          }`}
        >
          {workflowEnrichmentPending && !refreshingCandidates
            ? "Enriching candidate scores — inbox shows loaded rows"
            : "Refreshing Breezy candidates — inbox stays visible"}
        </p>
      </div>

      {candidateQueueScopeHint(queueScope) ? (
        <div
          role="status"
          className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300"
        >
          {candidateQueueScopeHint(queueScope)}
        </div>
      ) : null}

      <RecruiterInbox
        candidates={candidates}
        actingRecruiter={actingRecruiter}
        scrollToSection={scrollToInboxSection}
        onScrollToSectionHandled={() => setScrollToInboxSection(null)}
        renderRow={renderCandidateRow}
        tableHeader={candidateTableHeader}
        colSpan={7}
        databaseRows={databaseFiltered}
        search={search}
        onSearchChange={setSearch}
        searchPending={search.trim() !== debouncedSearch.trim()}
        databaseToolbar={databaseToolbar}
      />

      <RecruiterCollapsibleSection
        title="Analytics"
        description="Workflow funnel, productivity metrics, status counts, and DD backfill — expand when needed."
        defaultOpen={false}
      >
        <div className="space-y-4">
          <RecruiterCollapsibleSection title="Workflow funnel" defaultOpen={false}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {buckets.map((bucket) => (
                <div key={bucket.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-200">{bucket.label}</p>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-200">
                      {bucket.rows.length}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </RecruiterCollapsibleSection>

          <RecruiterCollapsibleSection title="Productivity metrics" defaultOpen={false}>
            <CandidateAutomationPanels
              queues={prioritizationQueues}
              productivity={recruiterProductivity}
              onOpenCandidate={setSelectedCandidateId}
            />
          </RecruiterCollapsibleSection>

          <RecruiterCollapsibleSection title="Workflow status counts" defaultOpen={false}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
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
          </RecruiterCollapsibleSection>

          <RecruiterCollapsibleSection title="DD backfill queue" defaultOpen={false}>
            <RecentDdBackfillQueue
              candidateNames={backfillCandidateNames}
              onWorkflowUpdated={(workflows) => applyWorkflowsBundle(workflows as CandidateWorkflowState)}
              onOpenCandidate={(candidateId) => setSelectedCandidateId(candidateId)}
            />
          </RecruiterCollapsibleSection>

          <RecruiterCollapsibleSection title="Queue lanes" defaultOpen={false}>
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
              quickFilter="all"
              onQuickFilterChange={() => {}}
              showMetrics={false}
            />
          </RecruiterCollapsibleSection>
        </div>
      </RecruiterCollapsibleSection>

      <CandidatesAdminDiagnostics
        syncData={syncData ?? null}
        syncHeaderLine={syncHeaderLine}
        syncAlert={syncAlert}
        enrichmentWarnings={enrichmentWarnings}
        showSyncAlert={showSyncAlert}
        showBackgroundSyncLine={Boolean(showBackgroundSyncLine)}
        backgroundSyncLine={
          showBackgroundSyncLine
            ? formatRecruiterBackgroundSyncLine(committedCandidates.length)
            : null
        }
        onboardingConfigLoaded={onboardingConfigLoaded}
        onboardingConfigured={onboardingConfigured}
        onboardingConfigError={onboardingConfigError}
        paperworkTemplateWarning={Boolean(paperworkTemplateWarning)}
        refreshing={refreshingCandidates}
        onRefresh={() => void loadBundle(true)}
      />

      <CandidateWorkspace
        key={selectedDrawerRow?.candidateId ?? "closed"}
        candidate={selectedDrawerRow}
        open={selectedDrawerRow !== null}
        onClose={() => setSelectedCandidateId(null)}
        matchScore={selectedCandidate?.matchPercent ?? null}
        actingRecruiter={actingRecruiter}
        rosters={rosters}
        sendBlockReason={
          selectedCandidate
            ? getSendPaperworkBlockReason(
                buildSendEligibility(
                  selectedCandidate,
                  "onboarding_packet",
                  paperworkSendingId === selectedCandidate.candidateId,
                ),
              )
            : null
        }
        paperworkSending={paperworkSendingId === selectedCandidate?.candidateId}
        workspaceBusy={workspaceBusy}
        onAddNote={(note) => {
          if (!selectedCandidate) return;
          updateWorkflow(selectedCandidate, selectedCandidate.workflowStatus, { note });
        }}
        onSendPaperwork={(templateKey) => {
          if (!selectedCandidate) return;
          sendPaperwork(selectedCandidate, templateKey);
        }}
        onRefreshPaperworkStatus={() => {
          if (!selectedCandidate) return;
          refreshPaperworkStatus(selectedCandidate);
        }}
        onAssignActingRecruiter={() => {
          if (!selectedCandidate) return;
          assignActingRecruiterToRow(selectedCandidate);
        }}
        onAssignRecruiter={(recruiter) => {
          if (!selectedCandidate) return;
          assignRecruiterToRow(selectedCandidate, recruiter);
        }}
        onAdvanceWorkflow={(input) => {
          void handleWorkspaceAdvance(input);
        }}
      />
    </div>
  );
}
