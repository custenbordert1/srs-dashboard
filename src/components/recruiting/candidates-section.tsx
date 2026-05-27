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
import type { CandidateRowAction } from "@/components/recruiting/candidate-actions-menu";
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
  isOnboardingRequestError,
  sendOnboardingPacket,
} from "@/lib/onboarding-client";
import { patchEnrichedRowsFromWorkflow } from "@/lib/patch-enriched-workflow-row";
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
  VirtualCandidateTable,
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
import { fetchCachedBreezyJobs } from "@/lib/cached-breezy-client";
import {
  CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS,
  CANDIDATES_TAB_LOADING_CEILING_MS,
  fetchAndMergeFastCandidates,
  fetchAndMergeFullCandidates,
  fetchCandidatesForTab,
  peekTabCandidatesCache,
  shouldHydrateFullCandidates,
  shouldSkipFastTierForHydration,
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
import {
  logCandidatesCacheWriteDecision,
  shouldAcceptCandidatesCacheWrite,
} from "@/lib/breezy-candidates-cache";
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
  computeRecruiterAgingBucket,
  matchesRecruiterQuickFilter,
  RECRUITER_AGING_BUCKET_LABELS,
  type RecruiterAgingBucket,
  type RecruiterQuickFilterId,
} from "@/lib/recruiter-action-queue-filters";
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
import { resolveCandidateRowPrimaryAction } from "@/lib/candidate-row-primary-action";
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
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
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
const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";
const thClass =
  "sticky top-0 z-10 whitespace-nowrap bg-zinc-900/95 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 backdrop-blur-sm";
/** Keep in sync with `CANDIDATE_TABLE_ROW_HEIGHT_PX` (54). */
const tdClass =
  "max-h-[54px] align-middle overflow-hidden whitespace-nowrap px-1.5 py-0 text-xs text-zinc-300";
const tdActionClass =
  "max-h-[54px] align-middle overflow-visible whitespace-nowrap px-1.5 py-0 text-xs text-zinc-300";
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

const OPERATIONAL_WORKFLOW_LABELS: Partial<Record<CandidateWorkflowStatus, string>> = {
  Applied: "Needs Review",
  "Needs Review": "Needs Review",
  Qualified: "Needs Recruiter Action",
  "Paperwork Needed": "Awaiting Paperwork",
  "Paperwork Sent": "Awaiting Paperwork",
  Signed: "Signed - Pending Onboarding",
  "Awaiting DD Verification": "Signed - Pending Onboarding",
  "Ready for MEL": "Ready for MEL",
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
  if (candidate.recruitingActions.priorityList) {
    return "border-l-2 border-l-amber-500/70";
  }
  if (candidate.assignedRecruiter === "Unassigned") {
    return "border-l-2 border-l-violet-500/60";
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

function operationalWorkflowState(
  candidate: ScoredCandidateWorkflowRow,
): string {
  if (candidate.recruitingActions.priorityList) return "Escalated";
  if (candidate.assignedRecruiter === "Unassigned") return "Awaiting Assignment";
  return OPERATIONAL_WORKFLOW_LABELS[candidate.workflowStatus] ?? candidate.workflowStatus;
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
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [queueActionBusy, setQueueActionBusy] = useState(false);
  const [recruiterQuickFilter, setRecruiterQuickFilter] = useState<RecruiterQuickFilterId>("all");
  const [onboardingConfigured, setOnboardingConfigured] = useState(false);
  const [onboardingConfigLoaded, setOnboardingConfigLoaded] = useState(false);
  const [onboardingConfigError, setOnboardingConfigError] = useState<string | null>(null);
  const [onboardingTemplatesAvailable, setOnboardingTemplatesAvailable] = useState(false);
  const [paperworkTemplates, setPaperworkTemplates] = useState<
    Array<{ key: OnboardingTemplateKey; label: string; configured: boolean }>
  >([]);
  const [paperworkSendingId, setPaperworkSendingId] = useState<string | null>(null);
  const [directDepositBusyId, setDirectDepositBusyId] = useState<string | null>(null);

  const confirmBulkApply = useCallback(
    (actionLabel: string): boolean => {
      const count = selectedIds.size;
      return window.confirm(
        `Apply "${actionLabel}" to ${count} selected candidate${count === 1 ? "" : "s"}?`,
      );
    },
    [selectedIds.size],
  );

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
      const priorSnapshot = breezySnapshotRef.current;
      if (priorSnapshot && incomingCount > 0 && priorCount > 0) {
        const decision = shouldAcceptCandidatesCacheWrite(parsed, priorSnapshot);
        logCandidatesCacheWriteDecision("ui", "commitCandidatesSuccess", decision);
        if (!decision.accepted) {
          logCandidatesClientTrace("commitCandidatesSuccess_skipped_poorer_overwrite", {
            priorSnapshotCount: priorCount,
            incomingCandidateCount: incomingCount,
            reason: decision.reason,
          });
          setNonBlockingSyncAlert(
            "Background sync incomplete — table shows last hydrated candidates.",
          );
          return;
        }
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
      const scheduleHydrationIfNeeded = () => {
        const snapshot = breezySnapshotRef.current;
        if (snapshot && shouldHydrateFullCandidates(snapshot)) {
          void hydrateRemainingCandidates(snapshot);
        }
      };

      const baseNow = breezySnapshotRef.current;
      if (baseNow && shouldSkipFastTierForHydration(baseNow)) {
        logCandidatesClientTrace("fast_tier_skipped_active_hydration", {
          candidateCount: baseNow.candidates.length,
          continuation: baseNow.hydrationJob?.lastContinuationPoint ?? baseNow.positionsScanned ?? 0,
        });
        scheduleHydrationIfNeeded();
        return;
      }

      setRefreshingCandidates(true);
      const fetchStarted = performance.now();
      try {
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
          scheduleHydrationIfNeeded();
        } else if (fastMerged.ok && shouldHydrateFullCandidates(fastMerged)) {
          scheduleHydrationIfNeeded();
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
          scheduleHydrationIfNeeded();
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
      if (options?.workflows) {
        setWorkflowState(options.workflows);
      } else {
        setWorkflowState((prev) => ({ ...prev, [workflow.candidateId]: workflow }));
      }
      const breezy = committedCandidates.find((c) => c.candidateId === workflow.candidateId);
      const job = breezy ? jobsByPositionId.get(breezy.positionId) : undefined;
      setEnrichedCandidates((prev) => patchEnrichedRowsFromWorkflow(prev, breezy, workflow, job));
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

      if (
        recruiterQuickFilter !== "all" &&
        !matchesRecruiterQuickFilter(candidate, recruiterQuickFilter, actingRecruiter)
      ) {
        return false;
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
        recruiterQuickFilter,
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
    actingRecruiter,
    recruiterQuickFilter,
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
  const operationalSnapshotCards = useMemo(
    () => [
      {
        id: "needs-review",
        label: "Needs Review",
        count: filtered.filter(
          (candidate) =>
            candidate.workflowStatus === "Applied" || candidate.workflowStatus === "Needs Review",
        ).length,
        tone: "neutral" as const,
      },
      {
        id: "awaiting-paperwork",
        label: "Awaiting Paperwork",
        count: filtered.filter(
          (candidate) =>
            candidate.workflowStatus === "Paperwork Needed" ||
            candidate.workflowStatus === "Paperwork Sent",
        ).length,
        tone: "warn" as const,
      },
      {
        id: "pending-onboarding",
        label: "Signed - Pending Onboarding",
        count: filtered.filter(
          (candidate) =>
            candidate.workflowStatus === "Signed" ||
            candidate.workflowStatus === "Awaiting DD Verification",
        ).length,
        tone: "neutral" as const,
      },
      {
        id: "ready-mel",
        label: "Ready for MEL",
        count: filtered.filter(
          (candidate) => candidate.workflowStatus === "Ready for MEL",
        ).length,
        tone: "ok" as const,
      },
      {
        id: "escalated",
        label: "Escalated",
        count: filtered.filter((candidate) => candidate.recruitingActions.priorityList).length,
        tone: "warn" as const,
      },
      {
        id: "unassigned",
        label: "Unassigned Candidates",
        count: filtered.filter((candidate) => candidate.assignedRecruiter === "Unassigned").length,
        tone: "warn" as const,
      },
    ],
    [filtered],
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

  const assignActingRecruiterToRow = useCallback(
    (candidate: ScoredCandidateWorkflowRow) => {
      void persistWorkflowUpdate({
        candidateId: candidate.candidateId,
        assignedRecruiter: actingRecruiter,
        workflowStatus: candidate.workflowStatus,
      })
        .then((workflow) => {
          commitWorkflowToView(workflow, { notice: workflowNoticeAssigned(actingRecruiter) });
        })
        .catch((err) => {
          window.alert(err instanceof Error ? err.message : "Assign recruiter failed");
        });
    },
    [actingRecruiter, commitWorkflowToView],
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
      const paperworkUrgent =
        isPaperworkPendingStatus(candidate.workflowStatus) &&
        candidate.paperworkStatus !== "signed";
      return (
        <tr
          key={candidate.candidateId}
          onClick={() => setSelectedCandidateId(candidate.candidateId)}
          className={`group cursor-pointer ${tableRowUrgencyClass(candidate)} ${
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
            <div className="flex min-w-0 flex-col justify-center gap-1 py-0.5">
              <div className="truncate text-sm font-semibold leading-tight text-zinc-100">
                {candidateName(candidate)}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <span
                  className={`${workflowPillClass} ${workflowStatusPillClass(candidate.workflowStatus, candidate)}`}
                  title={operationalWorkflowState(candidate)}
                >
                  {operationalWorkflowState(candidate)}
                </span>
                <span
                  className={`inline-flex max-w-[8rem] truncate rounded border px-1.5 py-0.5 text-[9px] ${
                    candidate.assignedRecruiter === "Unassigned"
                      ? "border-violet-500/50 bg-violet-500/10 text-violet-200"
                      : "border-zinc-700/80 bg-zinc-900/70 text-zinc-400"
                  }`}
                  title={`${candidate.assignedRecruiter} · ${candidate.assignedDM}`}
                >
                  {candidate.assignedRecruiter}
                </span>
                {candidate.recruitingActions.priorityList ? (
                  <span className="inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">
                    Escalated
                  </span>
                ) : null}
              </div>
              <p className="truncate text-[10px] text-zinc-500">
                {candidate.assignedDM} · {candidate.positionName || "No position"}
              </p>
            </div>
          </td>
          <td className={`${tdClass} truncate`}>{candidate.email || "—"}</td>
          <td className={`${tdClass} truncate`}>{candidate.phone || "—"}</td>
          <td className={`${tdClass} truncate text-zinc-500`}>{candidate.source || "—"}</td>
          <td className={`${tdClass} truncate text-zinc-400`}>{candidate.stage || "—"}</td>
          <td className={`${tdClass} truncate text-zinc-400`}>{formatDate(candidate.appliedDate)}</td>
          <td className={`${tdClass} truncate`}>{candidate.positionName || "—"}</td>
          <td className={tdClass}>{candidate.city || "—"}</td>
          <td className={tdClass}>{candidate.state || "—"}</td>
          <td className={`${tdClass} truncate text-[10px] leading-tight`}>
            <span className="text-zinc-500">
              Applied {formatDays(appliedDays)}
              <span className="text-zinc-600"> · </span>
              <StatusTouchAging candidate={candidate} />
            </span>
          </td>
          <td className={tdClass}>
            <div className="flex min-w-0 flex-col justify-center overflow-hidden leading-tight">
              <div
                className="truncate text-sm font-semibold text-teal-100"
                title={candidate.nextActionNeeded}
              >
                {candidate.nextActionNeeded}
              </div>
              <div className="truncate text-[10px] text-zinc-500">
                Recruiter: {candidate.assignedRecruiter}
              </div>
            </div>
          </td>
          <td className={tdActionClass} onClick={(event) => event.stopPropagation()}>
            <CandidateRowPrimaryActionBar
              primary={resolveCandidateRowPrimaryAction({
                candidate,
                actingRecruiter,
                sendBlockReason: getSendPaperworkBlockReason(
                  buildSendEligibility(
                    candidate,
                    "onboarding_packet",
                    paperworkSendingId === candidate.candidateId,
                  ),
                ),
                sendBusy: paperworkSendingId === candidate.candidateId,
              })}
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
          <td className={`${tdClass} text-zinc-500 underline-offset-2 hover:underline`} title="Open candidate drawer">
            Notes: {candidate.notes.length}
          </td>
          <td
            className={`${tdClass}${paperworkUrgent ? " bg-amber-500/5" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-7 flex-col justify-center overflow-hidden leading-tight">
              <span
                className={`truncate text-[10px] ${paperworkUrgent ? "font-medium text-amber-200" : "text-zinc-500"}`}
                title={candidate.paperworkError ?? undefined}
              >
                {paperworkStatusLabel(candidate.paperworkStatus)}
              </span>
              {candidate.signatureRequestId ? (
                <button
                  type="button"
                  className="truncate text-left text-[10px] text-teal-400/90 hover:underline"
                  onClick={() => refreshPaperworkStatus(candidate)}
                >
                  Refresh
                </button>
              ) : (
                <span className="invisible text-[10px]" aria-hidden>
                  —
                </span>
              )}
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
          <td
            className={`${tdClass} truncate text-[10px] text-zinc-600`}
            title={candidate.intelligenceSummary || candidate.skillTags.join(", ")}
          >
            {buildRecruiterFitSignals(candidate, 2)
              .map((s) => s.label)
              .join(" · ") || (candidate.skillTags[0] ?? "—")}
          </td>
          <td className={tdClass}>
            <span
              className={`inline-flex h-5 min-w-[2rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none ${AI_GRADE_STYLES[candidate.aiGrade]}`}
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
      onboardingConfigLoaded,
      onboardingConfigError,
      onboardingTemplatesAvailable,
      paperworkSendingId,
      paperworkTemplates,
      refreshPaperworkStatus,
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

  return (
    <div className="space-y-5">
      <div className="space-y-2" aria-live="polite">
        <div className={syncBannerSlotClass}>
          {showSyncAlert ? (
            <p
              role="alert"
              className={`${syncBannerClass} flex min-h-[2.75rem] items-center border-amber-500/30 bg-amber-500/10 py-2 text-amber-100`}
            >
              <span className="line-clamp-2">{formatRecruiterSyncAlert(syncAlert!)}</span>
            </p>
          ) : null}
        </div>
        <div className="min-h-[2.25rem]">
          {showBackgroundSyncLine ? (
            <p
              className={`${syncBannerClass} flex min-h-[2.25rem] items-center border-teal-500/25 bg-teal-500/10 py-1.5 text-xs text-teal-100`}
            >
              <span className="line-clamp-1 tabular-nums">
                {formatRecruiterBackgroundSyncLine(committedCandidates.length)}
              </span>
            </p>
          ) : null}
        </div>
        <div className={syncBannerSlotClass}>
          {enrichmentWarnings.length > 0 ? (
            <p
              className={`${syncBannerClass} flex min-h-[2.75rem] items-center border-sky-500/30 bg-sky-500/10 py-2 text-sky-100`}
            >
              <span className="line-clamp-2">{enrichmentWarnings.join(" ")}</span>
            </p>
          ) : null}
        </div>
        <div className={syncBannerSlotClass}>
          {workflowNotice ? (
            <p
              role="status"
              className={`${syncBannerClass} flex min-h-[2.75rem] items-center border-teal-500/30 bg-teal-500/10 py-2 text-teal-100`}
            >
              <span className="line-clamp-2">{workflowNotice}</span>
            </p>
          ) : null}
        </div>
      </div>

      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
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
            <p
              className="mt-1 min-h-[2.5rem] text-xs leading-snug text-zinc-500"
              title={syncHeaderLine ?? undefined}
            >
              {syncHeaderLine ? (
                <span className="line-clamp-2 tabular-nums">{syncHeaderLine}</span>
              ) : (
                <span className="invisible" aria-hidden>
                  Candidate list not loaded yet
                </span>
              )}
            </p>
            {onboardingConfigLoaded && onboardingConfigError ? (
              <p className="mt-1 text-xs text-amber-200/90" role="status">
                Dropbox Sign unavailable: {onboardingConfigError}
              </p>
            ) : onboardingConfigLoaded &&
              !onboardingConfigured &&
              !onboardingConfigError ? (
              <p className="mt-1 text-xs text-amber-200/90" role="status">
                Send disabled: set DROPBOX_SIGN_API_KEY in .env.local and restart the dev server.
              </p>
            ) : onboardingConfigLoaded &&
              onboardingConfigured &&
              !paperworkTemplates.some((t) => t.key === "onboarding_packet" && t.configured) ? (
              <p className="mt-1 text-xs text-amber-200/90" role="status">
                Send disabled: set DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET in .env.local.
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

      <div className="grid auto-rows-fr items-stretch gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Candidates shown"
          value={filtered.length.toLocaleString()}
          hint={`${candidates.length.toLocaleString()} currently available`}
        />
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
        quickFilter={recruiterQuickFilter}
        onQuickFilterChange={setRecruiterQuickFilter}
      />

      <RecruiterCollapsibleSection
        title="Analytics & productivity"
        description="AI prioritization and recruiter productivity — optional detail below the action queue."
        defaultOpen={false}
      >
        <CandidateAutomationPanels
          queues={prioritizationQueues}
          productivity={recruiterProductivity}
          onOpenCandidate={setSelectedCandidateId}
        />
      </RecruiterCollapsibleSection>

      <RecruiterCollapsibleSection
        title="Workflow buckets"
        description="Grouped counts by lifecycle stage — expand when you need a secondary view."
        defaultOpen={false}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
      </RecruiterCollapsibleSection>

      <RecruiterCollapsibleSection
        title="Recent DD backfill queue"
        description="Signed in the last 72 hours without DD requested — manual send only."
        defaultOpen
      >
        <RecentDdBackfillQueue
          candidateNames={backfillCandidateNames}
          onWorkflowUpdated={(workflows) =>
            applyWorkflowsBundle(workflows as CandidateWorkflowState)
          }
          onOpenCandidate={(candidateId) => setSelectedCandidateId(candidateId)}
        />
      </RecruiterCollapsibleSection>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Operational workflow snapshot</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Recruiter-first counts for active workflow movement and handoff readiness.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {operationalSnapshotCards.map((row) => {
            const interactive = row.id !== "unassigned";
            const active =
              (row.id === "escalated" && recruiterQuickFilter === "priority") ||
              (row.id === "needs-review" && workflowFilter === "Needs Review") ||
              (row.id === "awaiting-paperwork" && workflowFilter === "Paperwork Needed") ||
              (row.id === "pending-onboarding" && workflowFilter === "Awaiting DD Verification") ||
              (row.id === "ready-mel" && workflowFilter === "Ready for MEL");
            return (
              <button
                key={row.id}
                type="button"
                disabled={!interactive}
                onClick={() => {
                  if (row.id === "escalated") {
                    setRecruiterQuickFilter((current) =>
                      current === "priority" ? "all" : "priority",
                    );
                    return;
                  }
                  const targetStatus =
                    row.id === "needs-review"
                      ? "Needs Review"
                      : row.id === "awaiting-paperwork"
                        ? "Paperwork Needed"
                        : row.id === "pending-onboarding"
                          ? "Awaiting DD Verification"
                          : row.id === "ready-mel"
                            ? "Ready for MEL"
                            : null;
                  if (!targetStatus) return;
                  toggleWorkflowStatusFilter(targetStatus);
                }}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-teal-500/50 bg-teal-500/10 ring-1 ring-teal-500/30"
                    : row.tone === "warn"
                      ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-400/60 hover:bg-amber-500/10"
                      : row.tone === "ok"
                        ? "border-teal-500/30 bg-teal-500/5 hover:border-teal-400/60 hover:bg-teal-500/10"
                        : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-600 hover:bg-zinc-900/60"
                } ${interactive ? "" : "cursor-default opacity-90"}`}
              >
                <p className="text-xs text-zinc-500">{row.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{row.count}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="sticky top-0 z-20 space-y-2 border-b border-zinc-800/80 bg-zinc-900/95 px-3 py-2 backdrop-blur-sm sm:px-4">
          {recruiterQuickFilter !== "all" ? (
            <p className="text-[11px] text-teal-200/90">
              Table filtered by action queue — {filtered.length.toLocaleString()} candidate
              {filtered.length === 1 ? "" : "s"}. Use chips above the queue to change or clear.
            </p>
          ) : null}
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
            <p className="text-[11px] text-teal-200">
              {selectedIds.size} selected — use the bulk toolbar at bottom right.
            </p>
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

        <div
          className={`flex min-h-[1.75rem] items-center justify-center border-b border-teal-500/15 bg-teal-950/15 px-3 sm:px-4 ${
            refreshingCandidates || workflowEnrichmentPending ? "" : "border-b-transparent bg-transparent"
          }`}
          aria-live="polite"
        >
          <p
            className={`text-center text-[11px] leading-tight text-teal-200/80 ${
              refreshingCandidates || workflowEnrichmentPending ? "" : "invisible"
            }`}
          >
            {workflowEnrichmentPending && !refreshingCandidates
              ? "Enriching candidate scores — table shows loaded rows"
              : "Refreshing Breezy candidates — table stays visible"}
          </p>
        </div>
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-xs text-zinc-500 sm:px-4">No candidates match the selected filters.</p>
        ) : (
          <VirtualCandidateTable
            rows={filtered}
            colSpan={19}
            getRowKey={(candidate) => candidate.candidateId}
            renderRow={(candidate) => renderCandidateRow(candidate)}
            header={
              <>
                <colgroup>
                  <col className="w-[40px]" />
                  <col className="w-[272px]" />
                  <col className="w-[9%]" />
                  <col className="w-[6%]" />
                  <col className="w-[5%]" />
                  <col className="w-[5%]" />
                  <col className="w-[5%]" />
                  <col className="w-[7%]" />
                  <col className="w-[4%]" />
                  <col className="w-[3%]" />
                  <col className="w-[6%]" />
                  <col className="w-[9%]" />
                  <col className="w-[148px]" />
                  <col className="w-[4%]" />
                  <col className="w-[5%]" />
                  <col className="w-[4%]" />
                  <col className="w-[5%]" />
                  <col className="w-[4%]" />
                  <col className="w-[6%]" />
                </colgroup>
                <thead className="border-b border-zinc-800/60">
                <tr>
                  <th className={stickyCheckboxHeaderClass(thClass)}>
                    <input
                      type="checkbox"
                      aria-label="Select all filtered candidates"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </th>
                  <th className={stickyIdentityHeaderClass(thClass)}>Candidate</th>
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Phone</th>
                  <th className={thClass}>Source</th>
                  <th className={thClass}>Pipeline</th>
                  <th className={thClass}>Applied</th>
                  <th className={thClass}>Position</th>
                  <th className={thClass}>City</th>
                  <th className={thClass}>State</th>
                  <th className={thClass}>Aging</th>
                  <th className={thClass}>Next Recruiter Action</th>
                  <th className={thClass}>Action</th>
                  <th className={thClass}>Notes</th>
                  <th className={thClass}>HelloSign</th>
                  <th className={thClass}>Match</th>
                  <th className={thClass}>Skills</th>
                  <th className={thClass}>AI Grade</th>
                  <th className={thClass}>Recommendations</th>
                </tr>
              </thead>
              </>
            }
          />
        )}
      </section>

      {selectedIds.size > 0 ? (
        <div className="fixed bottom-4 right-4 z-40 w-[min(92vw,38rem)] rounded-xl border border-teal-500/35 bg-zinc-950/95 p-3 shadow-2xl shadow-black/60 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-teal-100">
              {selectedIds.size} selected
            </p>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setSelectedIds(new Set())}
              className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Clear selection
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              defaultValue=""
              disabled={bulkBusy}
              onChange={(event) => {
                const status = event.target.value as CandidateWorkflowStatus | "";
                if (!status) return;
                if (!confirmBulkApply(`Set status to ${status}`)) {
                  event.target.value = "";
                  return;
                }
                void runBulkUpdate({ workflowStatus: status });
                event.target.value = "";
              }}
            >
              <option value="">Bulk set workflow status…</option>
              {CANDIDATE_WORKFLOW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              defaultValue=""
              disabled={bulkBusy}
              onChange={(event) => {
                const recruiter = event.target.value;
                if (!recruiter) return;
                if (!confirmBulkApply(`Assign recruiter ${recruiter}`)) {
                  event.target.value = "";
                  return;
                }
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
              onClick={() => {
                if (!confirmBulkApply("Move to Paperwork Needed")) return;
                void runBulkUpdate({
                  workflowStatus: "Paperwork Needed",
                  note: "Bulk paperwork prep queued",
                });
              }}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/20"
            >
              Bulk paperwork prep
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => {
                const note = window.prompt("Note to add for all selected candidates:");
                if (!note?.trim()) return;
                if (!confirmBulkApply("Add note")) return;
                void runBulkUpdate({ note: note.trim() });
              }}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Bulk add note
            </button>
          </div>
        </div>
      ) : null}

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
        actingRecruiter={actingRecruiter}
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
        onFlagFollowUp={() => {
          if (!selectedCandidate) return;
          flagCandidateFollowUp(selectedCandidate.candidateId);
        }}
        onCompleteFollowUp={() => {
          if (!selectedCandidate) return;
          completeCandidateFollowUpRow(selectedCandidate.candidateId);
        }}
        onAssignActingRecruiter={() => {
          if (!selectedCandidate) return;
          assignActingRecruiterToRow(selectedCandidate);
        }}
        directDepositBusy={directDepositBusyId === selectedCandidate?.candidateId}
        onDirectDepositAction={(action, payload) => {
          if (!selectedCandidate) return;
          void runDirectDepositAction(selectedCandidate, action, payload).catch((err) => {
            window.alert(err instanceof Error ? err.message : "Direct deposit action failed");
          });
        }}
        melMatchesLoading={melLoading}
      />
    </div>
  );
}
