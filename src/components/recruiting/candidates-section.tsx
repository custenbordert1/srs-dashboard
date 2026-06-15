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
import { downloadCandidatesCsv, type CandidatesExportMetadata } from "@/lib/candidates-export";
import { matchesMyWorkFocus, matchesCandidateSummaryStrip, summarizeCandidateTableFilters } from "@/lib/candidate-focus-mode";
import {
  CANDIDATE_TABLE_IDENTITY_COL_PERCENT,
  CANDIDATE_TABLE_ROW_HEIGHT_PX,
  persistFocusMode,
  persistSectionExpanded,
  persistTableDensity,
  readCandidatesWorkspacePreferences,
  readSectionExpanded,
  type CandidateFocusMode,
  type CandidateSummaryStripFilterId,
  type CandidateTableDensity,
  type CandidatesWorkspaceSectionId,
} from "@/lib/candidates-workspace-preferences";
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
  cancelFullHydrationInflight,
  coalesceCandidatesSnapshotWithBaseline,
  continueCandidateHydration,
  fetchAndMergeFastCandidates,
  fetchCandidatesForTab,
  getTabCandidateCountHighWaterMark,
  getTabSnapshotHighWater,
  getRecoverableTabCandidatesSnapshot,
  getStartupRestoredTabSnapshot,
  isFullHydrationInflightActive,
  logCandidatesSnapshotCommit,
  peekTabCandidatesCache,
  restoreTabSnapshotsFromSession,
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
  withCandidatesSyncMeta,
} from "@/lib/breezy-candidates-sync";
import {
  logCandidatesCacheWriteDecision,
  pickRichestCandidatesSnapshot,
  shouldAcceptCandidatesCacheWrite,
} from "@/lib/breezy-candidates-cache";
import { resolveCandidatesTabDisplaySnapshot } from "@/lib/breezy-candidates-display";
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
  type RecruiterQuickFilterId,
} from "@/lib/recruiter-action-queue-filters";
import {
  buildCandidateSlaSnapshot,
  isFollowUpOverdue,
  isMelReadyStatus,
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
import {
  CANDIDATES_NO_CACHE_EMPTY_MESSAGE,
  formatCandidatesSafeModeDiagnostics,
  resolveCandidatesSafeModeState,
} from "@/lib/candidates-safe-mode";
import {
  clearCandidateWorkflowsSessionCache,
  peekCandidateWorkflowsSessionCache,
  shouldUseCandidateWorkflowsSessionCache,
  storeCandidateWorkflowsSessionCache,
  workflowCountFromSession,
} from "@/lib/candidate-workflows-session-cache";
import {
  beginBreezySyncPhase,
  endBreezySyncPhase,
  formatBreezySyncWatchdogBanner,
  getBreezySyncMetricsSnapshot,
  isBreezySyncPipelineActive,
  isHydrationContinuationInflight,
  recordBreezySyncApiRequest,
  recordBreezySyncTimeout,
  runBreezySyncPipeline,
  runExclusiveHydrationContinuation,
  subscribeBreezySyncMetrics,
} from "@/lib/breezy-sync-metrics";
import { CandidatesSyncDiagnosticsPanel } from "@/components/recruiting/candidates-sync-diagnostics";
import { RecentDdBackfillQueue } from "@/components/recruiting/recent-dd-backfill-queue";
import { CandidateRowPrimaryActionBar } from "@/components/recruiting/candidate-row-primary-action";
import {
  CANDIDATE_TABLE_STICKY_ACTION_PX,
  CANDIDATE_TABLE_STICKY_CHECKBOX_PX,
  stickyActionCellClass,
  stickyActionHeaderClass,
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
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

const ALL = "__all__";
const selectClass =
  "w-full rounded-md border border-zinc-600/80 bg-zinc-950/80 px-2.5 py-1.5 text-sm text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";
const inputClass =
  "w-full rounded-md border border-zinc-600/80 bg-zinc-950/80 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";
const thClass =
  "sticky top-0 z-10 whitespace-nowrap bg-zinc-900/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 backdrop-blur-sm";
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

/** Summary card only — compact US short date (e.g. 5/28/26). */
function formatNewestApplicantSummaryDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear() % 100;
  return `${month}/${day}/${year}`;
}

type CandidateTableSortKey =
  | "candidate"
  | "email"
  | "phone"
  | "source"
  | "applied"
  | "city"
  | "state"
  | "nextAction"
  | "paperwork"
  | "match"
  | "skills"
  | "aiGrade"
  | "recommendations";

function compareCandidatesForTableSort(
  a: ScoredCandidateWorkflowRow,
  b: ScoredCandidateWorkflowRow,
  key: CandidateTableSortKey,
): number {
  switch (key) {
    case "candidate":
      return candidateName(a).localeCompare(candidateName(b));
    case "email":
      return (a.email || "").localeCompare(b.email || "");
    case "phone":
      return (a.phone || "").localeCompare(b.phone || "");
    case "source":
      return (a.source || "").localeCompare(b.source || "");
    case "applied": {
      const appliedA = parseDate(a.appliedDate)?.getTime() ?? 0;
      const appliedB = parseDate(b.appliedDate)?.getTime() ?? 0;
      return appliedA - appliedB;
    }
    case "city":
      return (a.city || "").localeCompare(b.city || "");
    case "state":
      return (a.state || "").localeCompare(b.state || "");
    case "nextAction":
      return (a.nextActionNeeded || "").localeCompare(b.nextActionNeeded || "");
    case "paperwork":
      return (a.paperworkStatus || "").localeCompare(b.paperworkStatus || "");
    case "match":
      return a.matchPercent - b.matchPercent;
    case "skills": {
      const skillsA = buildRecruiterFitSignals(a, 2).map((signal) => signal.label).join(" ") || a.skillTags[0] || "";
      const skillsB = buildRecruiterFitSignals(b, 2).map((signal) => signal.label).join(" ") || b.skillTags[0] || "";
      return skillsA.localeCompare(skillsB);
    }
    case "aiGrade":
      return a.ai.numericScore - b.ai.numericScore;
    case "recommendations":
      return a.aiRecommendations.length - b.aiRecommendations.length;
    default:
      return 0;
  }
}

function CandidateTableSortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: CandidateTableSortKey;
  activeKey: CandidateTableSortKey | null;
  direction: "asc" | "desc";
  onSort: (key: CandidateTableSortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={className ?? thClass}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex min-h-[44px] w-full touch-manipulation items-center gap-1 text-left uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500/50"
        aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-zinc-600" aria-hidden>
          {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
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
    return "border-l-2 border-l-red-500/80";
  }
  const bucket = computeRecruiterAgingBucket(candidate);
  if (bucket === "3d" || bucket === "7d+") {
    return "border-l-2 border-l-red-500/65";
  }
  if (isMelReadyStatus(candidate.workflowStatus)) {
    return "border-l-2 border-l-emerald-500/75";
  }
  if (
    isPaperworkPendingStatus(candidate.workflowStatus) &&
    candidate.paperworkStatus !== "signed"
  ) {
    return "border-l-2 border-l-amber-500/75";
  }
  if (candidate.recruitingActions.priorityList) {
    return "border-l-2 border-l-amber-500/70";
  }
  if (candidate.assignedRecruiter === "Unassigned") {
    return "border-l-2 border-l-sky-500/55";
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
  sectionId,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  sectionId: CandidatesWorkspaceSectionId;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readSectionExpanded(sectionId, defaultOpen));
  useEffect(() => {
    persistSectionExpanded(sectionId, open);
  }, [sectionId, open]);
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

function readCandidatesSectionStartupSnapshot(): BreezyCandidatesSuccess | null {
  if (typeof window === "undefined") return null;
  return getStartupRestoredTabSnapshot();
}

export function CandidatesSection() {
  const { opportunities: melOpportunities, loading: melLoading } = useMelOpportunities();
  const startupSnapshotRef = useRef(readCandidatesSectionStartupSnapshot());
  /** Rows always render from this — never cleared on timeout/failed refresh. */
  const [breezySnapshot, setBreezySnapshot] = useState<BreezyCandidatesSuccess | null>(
    () => startupSnapshotRef.current,
  );
  const breezySnapshotRef = useRef<BreezyCandidatesSuccess | null>(startupSnapshotRef.current);
  /** Committed immediately on fast/preview — table paints before deferred scoring. */
  const [committedCandidates, setCommittedCandidates] = useState<BreezyCandidate[]>(
    () => startupSnapshotRef.current?.candidates ?? [],
  );
  const [enrichedCandidates, setEnrichedCandidates] = useState<ScoredCandidateWorkflowRow[]>([]);
  const [workflowEnrichmentPending, setWorkflowEnrichmentPending] = useState(false);
  const [data, setData] = useState<BreezyCandidatesResult | undefined>(
    () => startupSnapshotRef.current ?? undefined,
  );
  const displayCandidatesSnapshot = useMemo(
    () =>
      resolveCandidatesTabDisplaySnapshot({
        tableRows: committedCandidates,
        breezySnapshot,
        liveData: data?.ok ? data : null,
        recoverableSnapshot: getRecoverableTabCandidatesSnapshot(),
        highWaterSnapshot: getTabSnapshotHighWater(),
        startupSnapshot: startupSnapshotRef.current,
        cachePeekSnapshot: peekTabCandidatesCache(),
      }),
    [committedCandidates, breezySnapshot, data],
  );
  const authoritativeCandidates = useMemo(
    () => displayCandidatesSnapshot?.candidates ?? [],
    [displayCandidatesSnapshot],
  );
  const hasRenderableCandidateRows = authoritativeCandidates.length > 0;
  const [liveSyncPending, setLiveSyncPending] = useState(false);
  const [syncMetrics, setSyncMetrics] = useState(() => getBreezySyncMetricsSnapshot());
  const [refreshingCandidates, setRefreshingCandidates] = useState(false);
  const candidatesSafeMode = useMemo(
    () =>
      resolveCandidatesSafeModeState({
        snapshot: displayCandidatesSnapshot,
        hasRenderableRows: hasRenderableCandidateRows,
        liveDataOk: data?.ok === true,
        liveSyncPending,
        refreshing: refreshingCandidates || isFullHydrationInflightActive(),
      }),
    [
      data?.ok,
      displayCandidatesSnapshot,
      hasRenderableCandidateRows,
      liveSyncPending,
      refreshingCandidates,
    ],
  );
  useEffect(() => subscribeBreezySyncMetrics(() => setSyncMetrics(getBreezySyncMetricsSnapshot())), []);

  const safeModeDiagnosticsLine = useMemo(() => {
    const parts = [
      formatCandidatesSafeModeDiagnostics(candidatesSafeMode),
      formatBreezySyncWatchdogBanner(syncMetrics),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [candidatesSafeMode, syncMetrics]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (committedCandidates.length > 0 && (breezySnapshotRef.current?.candidates.length ?? 0) > 0) {
      return;
    }
    const restored =
      getStartupRestoredTabSnapshot() ??
      getRecoverableTabCandidatesSnapshot() ??
      peekTabCandidatesCache();
    if (!restored?.candidates.length) return;
    breezySnapshotRef.current = restored;
    setCommittedCandidates(restored.candidates);
    setBreezySnapshot(restored);
    if (!data?.ok) {
      setData(restored);
    }
  }, []);

  useEffect(() => {
    if (!hasRenderableCandidateRows) return;
    if (committedCandidates.length > 0 && breezySnapshot) return;
    const snapshot = displayCandidatesSnapshot;
    if (!snapshot?.candidates.length) return;
    breezySnapshotRef.current = snapshot;
    setCommittedCandidates(snapshot.candidates);
    setBreezySnapshot(snapshot);
    if (!data?.ok) {
      setData(snapshot);
    }
  }, [
    breezySnapshot,
    committedCandidates.length,
    data?.ok,
    displayCandidatesSnapshot,
    hasRenderableCandidateRows,
  ]);

  useEffect(() => {
    if (!data?.ok || !displayCandidatesSnapshot) return;
    const liveCount = data.candidates.length;
    const displayCount = displayCandidatesSnapshot.candidates.length;
    if (liveCount >= displayCount) return;
    logCandidatesSnapshotCommit({
      source: "authoritativeDisplay",
      scanMode: data.scanMode,
      candidateCount: liveCount,
      continuationPoint: Math.max(
        data.hydrationJob?.lastContinuationPoint ?? 0,
        data.positionsScanned ?? 0,
      ),
      restoreSnapshotCount: displayCount,
      highWaterCount: getTabCandidateCountHighWaterMark(),
      accepted: false,
      rejectionReason: "live_payload_poorer_than_authoritative_display",
    });
    logCandidatesClientTrace("authoritative_display_suppressed_poorer_live", {
      liveCandidateCount: liveCount,
      authoritativeDisplayCount: displayCount,
      scanMode: data.scanMode,
    });
  }, [displayCandidatesSnapshot, data]);
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
  const [tableSortKey, setTableSortKey] = useState<CandidateTableSortKey | null>(null);
  const [tableSortDirection, setTableSortDirection] = useState<"asc" | "desc">("desc");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [queueActionBusy, setQueueActionBusy] = useState(false);
  const [inlineActionBusyId, setInlineActionBusyId] = useState<string | null>(null);
  const [recruiterQuickFilter, setRecruiterQuickFilter] = useState<RecruiterQuickFilterId>("all");
  const [focusMode, setFocusMode] = useState<CandidateFocusMode>(() =>
    typeof window === "undefined" ? "all" : readCandidatesWorkspacePreferences().focusMode,
  );
  const [tableDensity, setTableDensity] = useState<CandidateTableDensity>(() =>
    typeof window === "undefined" ? "comfortable" : readCandidatesWorkspacePreferences().tableDensity,
  );
  const [summaryStripFilter, setSummaryStripFilter] = useState<CandidateSummaryStripFilterId>("all");
  const [onboardingConfigured, setOnboardingConfigured] = useState(false);
  const [onboardingConfigLoaded, setOnboardingConfigLoaded] = useState(false);
  const [onboardingConfigError, setOnboardingConfigError] = useState<string | null>(null);
  const [onboardingTemplatesAvailable, setOnboardingTemplatesAvailable] = useState(false);
  const [paperworkTemplates, setPaperworkTemplates] = useState<
    Array<{ key: OnboardingTemplateKey; label: string; configured: boolean }>
  >([]);
  const [paperworkSendingId, setPaperworkSendingId] = useState<string | null>(null);
  const [directDepositBusyId, setDirectDepositBusyId] = useState<string | null>(null);

  const handleTableColumnSort = useCallback(
    (key: CandidateTableSortKey) => {
      if (tableSortKey === key) {
        setTableSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return;
      }
      setTableSortKey(key);
      setTableSortDirection("asc");
    },
    [tableSortKey],
  );

  const handleFocusModeChange = useCallback((mode: CandidateFocusMode) => {
    setFocusMode(mode);
    persistFocusMode(mode);
  }, []);

  const handleTableDensityChange = useCallback((density: CandidateTableDensity) => {
    setTableDensity(density);
    persistTableDensity(density);
  }, []);

  const tableRowHeightPx = CANDIDATE_TABLE_ROW_HEIGHT_PX[tableDensity];
  const identityColPercent = CANDIDATE_TABLE_IDENTITY_COL_PERCENT[tableDensity];
  const tdClass =
    tableDensity === "comfortable"
      ? "align-middle overflow-hidden px-3 py-2 text-sm leading-snug text-zinc-200"
      : "align-middle overflow-hidden px-2.5 py-1 text-sm leading-snug text-zinc-200";
  const tdActionClass =
    tableDensity === "comfortable"
      ? "align-middle overflow-visible whitespace-nowrap px-2 py-2 text-sm text-zinc-200"
      : "align-middle overflow-visible whitespace-nowrap px-2 py-1 text-sm text-zinc-200";

  const buildExportMetadata = useCallback(
    (rows: ScoredCandidateWorkflowRow[]): CandidatesExportMetadata => ({
      exportDate: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date()),
      totalRecords: rows.length,
      filtersApplied: summarizeCandidateTableFilters({
        search: debouncedSearch,
        sourceFilter,
        stageFilter,
        positionFilter,
        cityFilter,
        stateFilter,
        workflowFilter,
        matchFilter,
        appliedFrom,
        appliedTo,
        recruiterQuickFilter,
        focusMode,
        actingRecruiter,
        summaryStripFilter,
      }),
    }),
    [
      actingRecruiter,
      appliedFrom,
      appliedTo,
      cityFilter,
      debouncedSearch,
      focusMode,
      matchFilter,
      positionFilter,
      recruiterQuickFilter,
      sourceFilter,
      stageFilter,
      stateFilter,
      summaryStripFilter,
      workflowFilter,
    ],
  );

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
      commitMeta?: { source?: string },
    ) => {
      const commitStarted = performance.now();
      const source = commitMeta?.source ?? "commitCandidatesSuccess";
      const restoreSnapshot = getRecoverableTabCandidatesSnapshot();
      const highWaterCount = getTabCandidateCountHighWaterMark();
      const restoreSnapshotCount = restoreSnapshot?.candidates.length ?? 0;
      const continuationPoint = Math.max(
        parsed.hydrationJob?.lastContinuationPoint ?? 0,
        parsed.positionsScanned ?? 0,
      );

      logCandidatesClientTrace("fast_commit_started", {
        priorSnapshotCount: breezySnapshotRef.current?.candidates.length ?? 0,
        incomingCandidateCount: parsed.candidates.length,
        incomingScanMode: parsed.scanMode,
        highWaterMark: highWaterCount,
        restoreSnapshotCount,
        fetchDurationMs: timing?.fetchDurationMs,
        normalizeDurationMs: timing?.normalizeDurationMs,
        source,
      });

      const priorSnapshot = pickRichestCandidatesSnapshot([
        breezySnapshotRef.current,
        getTabSnapshotHighWater(),
        restoreSnapshot,
        getStartupRestoredTabSnapshot(),
        peekTabCandidatesCache(),
      ]);
      let coalesced = coalesceCandidatesSnapshotWithBaseline(parsed, {
        downgradeSource: source,
      });
      let incomingCount = coalesced.candidates.length;
      const priorCount = priorSnapshot?.candidates.length ?? 0;

      if (incomingCount === 0 && priorCount > 0 && priorSnapshot) {
        logCandidatesSnapshotCommit({
          source,
          scanMode: parsed.scanMode,
          candidateCount: 0,
          continuationPoint,
          restoreSnapshotCount,
          highWaterCount,
          accepted: true,
          rejectionReason: "blocked_zero_commit_used_prior",
        });
        coalesced = coalesceCandidatesSnapshotWithBaseline(priorSnapshot, {
          downgradeSource: `${source}:zero_blocked`,
        });
        incomingCount = coalesced.candidates.length;
      }

      if (priorSnapshot && incomingCount > 0 && priorCount > 0) {
        const decision = shouldAcceptCandidatesCacheWrite(coalesced, priorSnapshot, {
          layer: "ui",
          downgradeSource: source,
        });
        logCandidatesCacheWriteDecision("ui", source, decision);
        if (!decision.accepted) {
          logCandidatesSnapshotCommit({
            source,
            scanMode: coalesced.scanMode,
            candidateCount: incomingCount,
            continuationPoint,
            restoreSnapshotCount,
            highWaterCount,
            accepted: false,
            rejectionReason: decision.reason,
          });
          logCandidatesClientTrace("commitCandidatesSuccess_skipped_poorer_overwrite", {
            priorSnapshotCount: priorCount,
            incomingCandidateCount: incomingCount,
            highWaterMark: highWaterCount,
            reason: decision.reason,
          });
          if (
            priorSnapshot.candidates.length > 0 &&
            (breezySnapshotRef.current?.candidates.length ?? 0) < priorCount
          ) {
            coalesced = priorSnapshot;
            incomingCount = priorCount;
          } else {
            setNonBlockingSyncAlert(
              "Background sync incomplete — table shows last hydrated candidates.",
            );
            return;
          }
        }
      }

      if (incomingCount === 0 && (highWaterCount > 0 || restoreSnapshotCount > 0)) {
        const fallback = pickRichestCandidatesSnapshot([priorSnapshot, restoreSnapshot]);
        if (fallback && fallback.candidates.length > 0) {
          logCandidatesSnapshotCommit({
            source,
            scanMode: parsed.scanMode,
            candidateCount: 0,
            continuationPoint,
            restoreSnapshotCount,
            highWaterCount,
            accepted: true,
            rejectionReason: "blocked_zero_commit_used_high_water",
          });
          coalesced = coalesceCandidatesSnapshotWithBaseline(fallback, {
            downgradeSource: `${source}:high_water_fallback`,
          });
          incomingCount = coalesced.candidates.length;
        }
      }

      if (incomingCount === 0) {
        logCandidatesSnapshotCommit({
          source,
          scanMode: parsed.scanMode,
          candidateCount: 0,
          continuationPoint,
          restoreSnapshotCount,
          highWaterCount,
          accepted: true,
          acceptedZeroWrite: true,
          rejectionReason: "no_richer_snapshot_to_apply",
        });
        if (priorCount > 0 || committedCandidates.length > 0) {
          setSyncAlert(buildCandidatesSyncAlert(coalesced));
          return;
        }
      }

      logCandidatesSnapshotCommit({
        source,
        scanMode: coalesced.scanMode,
        candidateCount: incomingCount,
        continuationPoint: Math.max(
          coalesced.hydrationJob?.lastContinuationPoint ?? 0,
          coalesced.positionsScanned ?? 0,
        ),
        restoreSnapshotCount,
        highWaterCount,
        accepted: incomingCount > 0,
        rejectionReason: incomingCount === 0 ? "empty_commit_no_rows" : undefined,
      });

      logCandidatesDebug("before_commitCandidatesSuccess", incomingCount, {
        commitCandidatesSuccessCalled: true,
        priorSnapshotCount: priorCount,
        highWaterMark: highWaterCount,
        willBecomeEmpty: incomingCount === 0,
      });
      logFirstCandidateKeys(
        "before_commitCandidatesSuccess",
        coalesced.candidates[0] as unknown as Record<string, unknown> | undefined,
      );
      breezySnapshotRef.current = coalesced;
      if (incomingCount > 0) {
        flushSync(() => {
          setCommittedCandidates(coalesced.candidates);
          setBreezySnapshot(coalesced);
          setData(coalesced);
        });
      } else {
        setBreezySnapshot(coalesced);
        setData(coalesced);
      }
      const commitDurationMs = Math.round(performance.now() - commitStarted);
      const alert = buildCandidatesSyncAlert(coalesced);
      if (incomingCount > 0 && alert?.toLowerCase().includes("timed out")) {
        setSyncAlert("Background sync in progress — table shows last loaded candidates.");
      } else {
        setSyncAlert(alert);
      }
      logCandidatesClientTrace("fast_commit_completed", {
        candidatesStateLength: incomingCount,
        snapshotCandidateCountAfter: coalesced.candidates.length,
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
    [committedCandidates.length],
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
      const recovered =
        restoreTabSnapshotsFromSession() ??
        getRecoverableTabCandidatesSnapshot() ??
        peekTabCandidatesCache() ??
        getTabSnapshotHighWater();
      if (recovered && recovered.candidates.length > 0) {
        logBreezyCandidatesOps("client", "fallback", {
          fallbackSource: "recoverable_tab_snapshot",
          reason: "commit_cached_rows_on_failure",
          candidateCount: recovered.candidates.length,
          error: failureMessage,
        });
        commitCandidatesSuccess(
          withCandidatesSyncMeta(recovered, {
            fromCache: true,
            stale: true,
            refreshError: failureMessage,
          }),
        );
        setSyncAlert(
          `${failureMessage} Showing loaded candidates — background sync incomplete.`,
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
    [commitCandidatesSuccess, committedCandidates.length, hasPopulatedSnapshot],
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
      const recovered =
        restoreTabSnapshotsFromSession() ??
        getRecoverableTabCandidatesSnapshot() ??
        peekTabCandidatesCache();
      if (recovered?.candidates.length) {
        commitCandidatesSuccess(
          withCandidatesSyncMeta(recovered, {
            fromCache: true,
            stale: true,
            refreshError: timedOut
              ? timeoutShowsCachedCandidatesMessage(CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS, true)
              : message,
          }),
          undefined,
          { source: "preview_fetch_error:recoverable" },
        );
        setSyncAlert(
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
    [commitCandidatesFailure, commitCandidatesSuccess, hasPopulatedSnapshot, setNonBlockingSyncAlert],
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
      if (isHydrationContinuationInflight()) {
        return;
      }
      await runExclusiveHydrationContinuation(async () => {
        beginBreezySyncPhase("hydration-continuation");
        logCandidatesClientTrace("hydrateRemainingCandidates_start", {
          baseCandidateCount: base.candidates.length,
        });
        setRefreshingCandidates(true);
        try {
          const fetchStarted = performance.now();
          recordBreezySyncApiRequest({ liveHit: true });
          const merged = await continueCandidateHydration(base, {
            reclaimStale: true,
            forceContinuation: true,
          });
          const fetchDurationMs = Math.round(performance.now() - fetchStarted);
          logCandidatesClientTrace("hydrateRemainingCandidates_response", {
            ok: merged.ok,
            candidateCount: merged.ok ? merged.candidates.length : 0,
            fetchDurationMs,
          });
          if (merged.ok) {
            commitCandidatesSuccess(merged, { fetchDurationMs });
            endBreezySyncPhase("hydration-continuation", {
              candidateCount: merged.candidates.length,
              liveHit: true,
            });
          } else {
            endBreezySyncPhase("hydration-continuation", { liveHit: true });
          }
        } catch {
          recordBreezySyncTimeout("hydration-continuation");
          endBreezySyncPhase("hydration-continuation", { timedOut: true });
        } finally {
          setRefreshingCandidates(false);
        }
      });
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
      beginBreezySyncPhase("fast-tier");
      const fetchStarted = performance.now();
      try {
        const baseCount = baseNow?.candidates.length ?? 0;
        logCandidatesClientTrace("fast_tier_start", {
          baseSnapshotCount: baseCount,
          mergeWithBase: Boolean(baseNow && baseCount > 0),
        });
        recordBreezySyncApiRequest({ liveHit: true });
        const fastMerged =
          baseNow && baseCount > 0
            ? await fetchAndMergeFastCandidates(baseNow, { force })
            : await fetchCandidatesForTab({ force, scan: "fast" });
        const fetchDurationMs = Math.round(performance.now() - fetchStarted);
        const cacheHit = fastMerged.ok ? Boolean(fastMerged.fromCache || fastMerged.showingCachedSnapshot) : false;
        logCandidatesClientTrace("fast_tier_response_ui", {
          ok: fastMerged.ok,
          candidateCount: fastMerged.ok ? fastMerged.candidates.length : 0,
          scanMode: fastMerged.ok ? fastMerged.scanMode : undefined,
          fromCache: fastMerged.ok ? fastMerged.fromCache : undefined,
          fetchDurationMs,
        });
        if (fastMerged.ok && fastMerged.candidates.length > 0) {
          endBreezySyncPhase("fast-tier", {
            candidateCount: fastMerged.candidates.length,
            cacheHit,
            liveHit: !cacheHit,
          });
          commitCandidatesSuccess(fastMerged, { fetchDurationMs });
          if (shouldHydrateFullCandidates(fastMerged)) {
            void hydrateRemainingCandidates(fastMerged);
          }
        } else if (hasPopulatedSnapshot()) {
          endBreezySyncPhase("fast-tier", { cacheHit, liveHit: !cacheHit });
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
          endBreezySyncPhase("fast-tier", { cacheHit, liveHit: !cacheHit });
          scheduleHydrationIfNeeded();
        } else {
          endBreezySyncPhase("fast-tier", { cacheHit, liveHit: !cacheHit });
        }
      } catch (err) {
        const timedOut = isTimeoutError(err);
        if (timedOut) {
          recordBreezySyncTimeout("fast-tier");
        }
        endBreezySyncPhase("fast-tier", { timedOut });
        if (hasPopulatedSnapshot()) {
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

  const bootstrapCachedCandidatesView = useCallback((): boolean => {
    const restored =
      restoreTabSnapshotsFromSession() ??
      peekTabCandidatesCache() ??
      getRecoverableTabCandidatesSnapshot();
    if (!restored?.candidates.length) return false;
    logCandidatesClientTrace("safe_mode_bootstrap", {
      candidateCount: restored.candidates.length,
      scanMode: restored.scanMode,
      highWaterMark: getTabCandidateCountHighWaterMark(),
    });
    commitCandidatesSuccess(
      withCandidatesSyncMeta(restored, {
        fromCache: true,
        stale: true,
      }),
      undefined,
      { source: "safe_mode:bootstrap" },
    );
    return true;
  }, [commitCandidatesSuccess]);

  const reconcileEmptyAfterBackgroundSync = useCallback(
    (
      deferredPreviewFailure: CandidatesTabFetchResult | null,
      previewResult: CandidatesTabFetchResult | null,
    ) => {
      if ((breezySnapshotRef.current?.candidates.length ?? 0) > 0) return;

      if (deferredPreviewFailure) {
        const previewFailureMessage =
          deferredPreviewFailure.ok === false ? deferredPreviewFailure.error : null;
        const recovered = getRecoverableTabCandidatesSnapshot() ?? peekTabCandidatesCache();
        if (recovered?.candidates.length) {
          commitCandidatesSuccess(
            withCandidatesSyncMeta(recovered, {
              fromCache: true,
              stale: true,
              refreshError: previewFailureMessage ?? undefined,
            }),
            undefined,
            { source: "safe_mode:recover_after_failure" },
          );
          setNonBlockingSyncAlert(
            previewFailureMessage
              ? `${previewFailureMessage} Showing cached candidates — background sync continues.`
              : buildCandidatesSyncAlert(recovered) ??
                  "Showing cached candidates — background sync continues.",
          );
          return;
        }
        commitCandidatesFailure(deferredPreviewFailure);
        return;
      }

      if (previewResult?.ok) {
        const richest =
          getRecoverableTabCandidatesSnapshot() ??
          peekTabCandidatesCache() ??
          getTabSnapshotHighWater();
        if (richest?.candidates.length) {
          commitCandidatesSuccess(
            withCandidatesSyncMeta(richest, {
              fromCache: true,
              stale: true,
              refreshError: "Breezy returned no candidates for this tier; using prior snapshot.",
            }),
            undefined,
            { source: "safe_mode:empty_ok_richest_fallback" },
          );
          return;
        }
        logCandidatesClientTrace("sync_complete_empty_ok_no_richer_snapshot", {
          positionsScanned: previewResult.positionsScanned ?? 0,
          highWaterMark: getTabCandidateCountHighWaterMark(),
        });
        setSyncAlert(buildCandidatesSyncAlert(previewResult));
      }
    },
    [commitCandidatesFailure, commitCandidatesSuccess, setNonBlockingSyncAlert],
  );

  const runBackgroundBreezySync = useCallback(
    async (force = false) => {
      setLiveSyncPending(true);

      try {
      if (force) {
        cancelFullHydrationInflight();
        clearCandidateWorkflowsSessionCache();
      }

      const enrichment: string[] = [];
      let deferredPreviewFailure: CandidatesTabFetchResult | null = null;
      let previewResult: CandidatesTabFetchResult | null = null;
      const fastWorkPromise = runFastTier(force);

      beginBreezySyncPhase("preview");
      try {
        const previewStarted = performance.now();
        recordBreezySyncApiRequest({ liveHit: true });
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
        const previewCacheHit = preview.ok
          ? Boolean(preview.fromCache || preview.showingCachedSnapshot)
          : false;
        if (preview.ok) {
          endBreezySyncPhase("preview", {
            candidateCount: preview.candidates.length,
            cacheHit: previewCacheHit,
            liveHit: !previewCacheHit,
          });
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
            setSyncAlert(buildCandidatesSyncAlert(preview));
          } else {
            logCandidatesClientTrace("preview_empty_no_prior_snapshot", {
              positionsScanned: preview.positionsScanned ?? 0,
            });
            setSyncAlert(buildCandidatesSyncAlert(preview));
          }
        } else if (hasPopulatedSnapshot()) {
          endBreezySyncPhase("preview", { liveHit: true });
          setNonBlockingSyncAlert(
            `${preview.error} Showing loaded candidates — background sync incomplete.`,
          );
        } else {
          endBreezySyncPhase("preview", { timedOut: true });
          deferredPreviewFailure = preview;
        }
      } catch (err) {
        const timedOut = isTimeoutError(err);
        if (timedOut) {
          recordBreezySyncTimeout("preview");
        }
        endBreezySyncPhase("preview", { timedOut });
        if (hasPopulatedSnapshot()) {
          handlePreviewFetchError(err);
        } else {
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

      try {
        await fastWorkPromise;
        reconcileEmptyAfterBackgroundSync(deferredPreviewFailure, previewResult);
      } catch {
        reconcileEmptyAfterBackgroundSync(deferredPreviewFailure, previewResult);
      }

      beginBreezySyncPhase("jobs");
      const jobsPromise = fetchCachedBreezyJobs().finally(() => {
        endBreezySyncPhase("jobs", { liveHit: true });
      });

      beginBreezySyncPhase("workflows");
      const workflowsPromise = (async () => {
        if (shouldUseCandidateWorkflowsSessionCache(force)) {
          const sessionHit = peekCandidateWorkflowsSessionCache();
          if (sessionHit?.ok) {
            endBreezySyncPhase("workflows", {
              skipped: true,
              cacheHit: true,
              workflowCount: workflowCountFromSession(sessionHit),
            });
            return sessionHit;
          }
        }
        recordBreezySyncApiRequest({ liveHit: true });
        const workflowRes = await fetchWithTimeout(CANDIDATES_WORKFLOW_SOURCE.apiPath, {
          cache: "no-store",
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const payload = (await workflowRes.json()) as {
          ok: boolean;
          workflows?: CandidateWorkflowState;
          rosters?: RecruiterRosters;
          error?: string;
        };
        const stored = payload.ok ? storeCandidateWorkflowsSessionCache(payload) : null;
        endBreezySyncPhase("workflows", {
          workflowCount: workflowCountFromSession(
            stored ?? { ok: payload.ok, workflows: payload.workflows, fetchedAt: Date.now() },
          ),
          liveHit: true,
        });
        return payload;
      })().catch((err) => {
        if (isTimeoutError(err)) {
          recordBreezySyncTimeout("workflows");
        }
        endBreezySyncPhase("workflows", { timedOut: true });
        throw err;
      });

      const [jobsSettled, workflowsSettled] = await Promise.allSettled([
        jobsPromise,
        workflowsPromise,
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
        enrichment.push(
          `Job enrichment unavailable (${jobsErr}) — position match fields may be limited.`,
        );
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

      if (force) {
        const snapshot = breezySnapshotRef.current;
        if (snapshot && !isHydrationContinuationInflight()) {
          await hydrateRemainingCandidates(snapshot);
        }
      }
      } finally {
        setLiveSyncPending(false);
      }
    },
    [
    commitCandidatesFailure,
    commitCandidatesSuccess,
    handlePreviewFetchError,
    hasPopulatedSnapshot,
    reconcileEmptyAfterBackgroundSync,
    runFastTier,
    setNonBlockingSyncAlert,
  ],
  );

  const loadBundle = useCallback(
    (force = false) => {
      const cacheRestored = bootstrapCachedCandidatesView();
      return runBreezySyncPipeline(() => runBackgroundBreezySync(force), {
        force,
        cacheRestored,
        duplicateLabel: force ? "refresh" : "mount",
      });
    },
    [bootstrapCachedCandidatesView, runBackgroundBreezySync],
  );

  useEffect(() => {
    void loadBundle(false);
  }, [loadBundle]);

  /** Keep draining the hydration queue across idle periods without waiting for manual refresh. */
  useEffect(() => {
    if (!breezySnapshot || !shouldHydrateFullCandidates(breezySnapshot)) return undefined;
    const pump = () => {
      const current = breezySnapshotRef.current;
      if (!current || !shouldHydrateFullCandidates(current)) return;
      if (
        liveSyncPending ||
        refreshingCandidates ||
        isFullHydrationInflightActive() ||
        isBreezySyncPipelineActive() ||
        isHydrationContinuationInflight()
      ) {
        return;
      }
      void hydrateRemainingCandidates(current);
    };
    const intervalId = window.setInterval(pump, 45_000);
    return () => window.clearInterval(intervalId);
  }, [breezySnapshot, hydrateRemainingCandidates, liveSyncPending, refreshingCandidates]);

  useEffect(() => {
    logCandidatesClientTrace("candidates_state_after_render", {
      breezySnapshotCount: breezySnapshot?.candidates.length ?? 0,
      committedCandidateCount: committedCandidates.length,
      authoritativeDisplayCount: displayCandidatesSnapshot?.candidates.length ?? 0,
      enrichedRowCount: enrichedCandidates.length,
      dataOk: data?.ok,
      dataCandidateCount: data?.ok ? data.candidates.length : 0,
      hasRenderableCandidateRows,
      liveSyncPending,
      refreshingCandidates,
      workflowEnrichmentPending,
    });
  }, [
    displayCandidatesSnapshot?.candidates.length,
    breezySnapshot,
    committedCandidates.length,
    data,
    enrichedCandidates.length,
    hasRenderableCandidateRows,
    liveSyncPending,
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

  const jobsByPositionId = useMemo(
    () => (jobsData?.ok ? buildJobsByPositionId(jobsData.jobs) : new Map()),
    [jobsData],
  );

  useEffect(() => {
    if (authoritativeCandidates.length === 0) {
      return;
    }

    const enrichmentStarted = performance.now();
    logCandidatesClientTrace("workflow_enrichment_started", {
      snapshotCandidateCount: authoritativeCandidates.length,
    });

    const timerId = window.setTimeout(() => {
      setWorkflowEnrichmentPending(true);
      startTransition(() => {
        const rows = authoritativeCandidates.map((candidate) => {
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
  }, [authoritativeCandidates, jobsByPositionId, workflowState]);

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
    return authoritativeCandidates.map((candidate) =>
      buildBaselineWorkflowRow(candidate, workflowState[candidate.candidateId]),
    );
  }, [authoritativeCandidates, enrichedCandidates, workflowState]);

  const summaryStripCounts = useMemo(() => {
    const count = (filter: CandidateSummaryStripFilterId) =>
      candidates.filter((candidate) => matchesCandidateSummaryStrip(candidate, filter, actingRecruiter)).length;
    return {
      assigned: count("assigned"),
      needsFollowUp: count("needs-follow-up"),
      paperwork: count("paperwork"),
      readyMel: count("ready-mel"),
      unassigned: count("unassigned"),
    };
  }, [actingRecruiter, candidates]);

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

      if (focusMode === "my-work" && !matchesMyWorkFocus(candidate, actingRecruiter)) {
        return false;
      }

      if (
        summaryStripFilter !== "all" &&
        !matchesCandidateSummaryStrip(candidate, summaryStripFilter, actingRecruiter)
      ) {
        return false;
      }

      return true;
    });

    const sorted = [...rows].sort((a, b) => {
      if (tableSortKey) {
        const compared = compareCandidatesForTableSort(a, b, tableSortKey);
        if (compared !== 0) {
          return tableSortDirection === "asc" ? compared : -compared;
        }
        return candidateName(a).localeCompare(candidateName(b));
      }
      return (
        b.matchPercent - a.matchPercent ||
        b.ai.numericScore - b.ai.numericScore ||
        candidateName(a).localeCompare(candidateName(b))
      );
    });
    logCandidatesClientTrace("table_render_state", {
      tableRowsCommittedToState: sorted.length,
      hasRenderableCandidateRows,
      snapshotCandidateCount: displayCandidatesSnapshot?.candidates.length ?? 0,
      committedCandidateCount: committedCandidates.length,
      liveDataCandidateCount: data?.ok ? data.candidates.length : 0,
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
        focusMode,
        summaryStripFilter,
      },
    });
    logCandidatesDebug("after_table_filter", sorted.length, {
      tableRowsCommittedToState: sorted.length,
      snapshotCandidates: displayCandidatesSnapshot?.candidates.length ?? 0,
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
    displayCandidatesSnapshot?.candidates.length,
    candidates,
    data,
    cityFilter,
    debouncedSearch,
    matchFilter,
    positionFilter,
    actingRecruiter,
    recruiterQuickFilter,
    focusMode,
    summaryStripFilter,
    searchIndex,
    sourceFilter,
    stageFilter,
    stateFilter,
    tableSortDirection,
    tableSortKey,
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
    return newest ? formatNewestApplicantSummaryDate(newest) : "—";
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
    const breezy = displayCandidatesSnapshot?.candidates.find(
      (c) => c.candidateId === selectedCandidate.candidateId,
    );
    if (!breezy || melOpportunities.length === 0) return row;
    const melMatch = matchCandidateToOpportunities(breezy, melOpportunities);
    return {
      ...row,
      matchedOpportunities: melMatch.matches,
      melMatchingSummary: melMatch.aiSummary,
    };
  }, [displayCandidatesSnapshot, melOpportunities, selectedCandidate]);

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
    (
      candidateId: string,
      payload: CandidateQueueActionPayload,
      options?: { source?: "queue" | "table" },
    ) => {
      const row = candidates.find((c) => c.candidateId === candidateId);
      if (!row) return;
      if (options?.source === "table") setInlineActionBusyId(candidateId);
      else setQueueActionBusy(true);
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
              `DM assigned: ${payload.dm}`,
            );
            break;
          case "apply-suggested-dm":
            finish(
              await persistWorkflowUpdate({
                candidateId,
                assignedDM: row.suggestedDM,
                workflowStatus: row.workflowStatus,
              }),
              row.suggestedDM ? `DM assigned: ${row.suggestedDM}` : undefined,
            );
            break;
          case "mark-follow-up":
            finish(await persistRecruitingActionToggle(candidateId, "needs-follow-up", true));
            break;
          case "complete-follow-up":
            finish(await completeCandidateFollowUp(candidateId));
            break;
          case "snooze-24h":
            finish(await snoozeCandidate24h(candidateId), "Candidate snoozed for 24 hours.");
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
        .finally(() => {
          if (options?.source === "table") setInlineActionBusyId(null);
          else setQueueActionBusy(false);
        });
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
    options: {
      workflowStatus?: CandidateWorkflowStatus;
      assignedRecruiter?: string;
      assignedDM?: string;
      note?: string;
    },
  ) {
    const rows = candidates.filter((candidate) => selectedIds.has(candidate.candidateId));
    if (rows.length === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        rows.map((candidate) =>
          persistWorkflow(candidate, options.workflowStatus ?? candidate.workflowStatus, {
            assignedRecruiter: options.assignedRecruiter,
            assignedDM: options.assignedDM,
            note: options.note,
          }),
        ),
      );
      const statusNotice =
        options.workflowStatus != null
          ? workflowNoticeStatus(options.workflowStatus)
          : options.assignedRecruiter
            ? workflowNoticeAssigned(options.assignedRecruiter)
            : options.assignedDM
              ? `DM assigned: ${options.assignedDM}`
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

  async function runBulkSnooze() {
    const rows = candidates.filter((candidate) => selectedIds.has(candidate.candidateId));
    if (rows.length === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(rows.map((candidate) => snoozeCandidate24h(candidate.candidateId)));
      for (const workflow of results) {
        commitWorkflowToView(workflow);
      }
      setWorkflowNotice(`Snoozed ${results.length} candidate${results.length === 1 ? "" : "s"} for 24 hours.`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Bulk snooze failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkEscalate() {
    const rows = candidates.filter((candidate) => selectedIds.has(candidate.candidateId));
    if (rows.length === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        rows.map((candidate) => persistRecruitingActionToggle(candidate.candidateId, "priority-list", true)),
      );
      for (const workflow of results) {
        commitWorkflowToView(workflow);
      }
      setWorkflowNotice(`Escalated ${results.length} candidate${results.length === 1 ? "" : "s"}.`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Bulk escalate failed");
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
      const rowSelected = selectedCandidateId === candidate.candidateId;
      const assignedToMe = candidate.assignedRecruiter.trim() === actingRecruiter.trim();
      const locationLabel = [candidate.city, candidate.state].filter(Boolean).join(", ") || "—";
      const identityGapClass = tableDensity === "comfortable" ? "gap-1.5" : "gap-1";
      const identityTextClass = tableDensity === "comfortable" ? "text-[15px]" : "text-sm";
      return (
        <tr
          key={candidate.candidateId}
          onClick={() => setSelectedCandidateId(candidate.candidateId)}
          className={`group cursor-pointer ${tableRowUrgencyClass(candidate)} ${
            rowSelected
              ? "bg-teal-500/8 hover:bg-teal-500/12 ring-1 ring-inset ring-teal-500/25"
              : "hover:bg-zinc-800/30"
          }`}
          style={{ height: tableRowHeightPx, maxHeight: tableRowHeightPx }}
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
              <div className={`flex min-w-0 flex-col justify-center py-0.5 ${identityGapClass}`}>
                <div className={`truncate font-semibold leading-tight text-zinc-50 ${identityTextClass}`}>
                  {candidateName(candidate)}
                </div>
                <p className="truncate text-sm text-zinc-300">{candidate.positionName || "No position"}</p>
                <p className="truncate text-xs text-zinc-400">{locationLabel}</p>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span
                    className={`${workflowPillClass} ${workflowStatusPillClass(candidate.workflowStatus, candidate)}`}
                    title={operationalWorkflowState(candidate)}
                  >
                    {operationalWorkflowState(candidate)}
                  </span>
                  {candidate.recruitingActions.priorityList ? (
                    <span className="inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                      Escalated
                    </span>
                  ) : null}
                </div>
                <CandidateRowAttentionBadges candidate={candidate} />
              </div>
            </td>
            <td className={`${tdClass} !whitespace-normal`}>
              <div className="flex min-w-0 flex-col justify-center gap-1 py-1">
                <p className="text-sm text-zinc-200">{formatDate(candidate.appliedDate)}</p>
                <p className="truncate text-xs text-zinc-400">{candidate.source || "—"}</p>
                <div className="flex items-center gap-2">
                  <CandidateMatchBadge
                    matchPercent={candidate.matchPercent}
                    matchLevel={candidate.matchLevel}
                    isTopMatch={candidate.isTopMatch}
                    compact
                  />
                  <span
                    className={`inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${AI_GRADE_STYLES[candidate.aiGrade]}`}
                  >
                    {candidate.aiGrade}
                  </span>
                </div>
                <p className="line-clamp-1 text-xs font-medium text-teal-200/90" title={candidate.nextActionNeeded}>
                  {candidate.nextActionNeeded}
                </p>
              </div>
            </td>
            <td
              className={stickyActionCellClass(tdActionClass, {
                selected: rowSelected,
                rowBg: "bg-zinc-950",
              })}
              onClick={(event) => event.stopPropagation()}
            >
              <CandidateRowPrimaryActionBar
                assignedToMe={assignedToMe}
                onAssignMe={() => assignActingRecruiterToRow(candidate)}
                onReview={() => setSelectedCandidateId(candidate.candidateId)}
                followUpDisabled={candidate.recruitingActions.needsFollowUp}
                onFollowUp={() => flagCandidateFollowUp(candidate.candidateId)}
                onFollowUpDone={() => completeCandidateFollowUpRow(candidate.candidateId)}
                onSend={() => sendPaperwork(candidate, "onboarding_packet")}
                onNote={() => addQuickNoteToRow(candidate)}
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
      actingRecruiter,
      addQuickNoteToRow,
      applyRosters,
      assignActingRecruiterToRow,
      buildSendEligibility,
      completeCandidateFollowUpRow,
      flagCandidateFollowUp,
      handleCandidateAction,
      onboardingConfigured,
      onboardingConfigLoaded,
      onboardingConfigError,
      onboardingTemplatesAvailable,
      paperworkSendingId,
      paperworkTemplates,
      rosters,
      selectedCandidateId,
      selectedIds,
      sendPaperwork,
      tableDensity,
      tableRowHeightPx,
      tdActionClass,
      tdClass,
      toggleSelectCandidate,
    ],
  );

  const displaySnapshot = displayCandidatesSnapshot;

  const showSyncAlert = Boolean(syncAlert);
  const showSafeModeDiagnostics = Boolean(safeModeDiagnosticsLine);
  const showBackgroundSyncLine =
    candidatesSafeMode.liveSyncPending ||
    refreshingCandidates ||
    isFullHydrationInflightActive();
  const syncHeaderLine = displaySnapshot
    ? formatRecruiterCandidatesSyncHeader({
        candidateCount: displaySnapshot.candidates.length,
        fetchedAt: displaySnapshot.fetchedAt,
        fromCache: displaySnapshot.fromCache,
        stale: displaySnapshot.stale,
        partial: displaySnapshot.partial,
        positionsScanned: displaySnapshot.positionsScanned,
        totalPositionsAvailable: displaySnapshot.totalPositionsAvailable,
        refreshing: candidatesSafeMode.liveSyncPending || refreshingCandidates,
      })
    : candidatesSafeMode.liveSyncPending
      ? formatRecruiterCandidatesSyncHeader({
          candidateCount: 0,
          fetchedAt: new Date().toISOString(),
          refreshing: true,
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
        <div className={syncBannerSlotClass}>
          {showSafeModeDiagnostics ? (
            <p
              role="status"
              className={`${syncBannerClass} flex min-h-[2.75rem] items-center border-zinc-600/40 bg-zinc-800/50 py-2 text-zinc-200`}
            >
              <span className="line-clamp-2">{safeModeDiagnosticsLine}</span>
            </p>
          ) : null}
        </div>
        <div className="min-h-[2.25rem]">
          {showBackgroundSyncLine ? (
            <p
              className={`${syncBannerClass} flex min-h-[2.25rem] items-center border-teal-500/25 bg-teal-500/10 py-1.5 text-xs text-teal-100`}
            >
              <span className="line-clamp-1 tabular-nums">
                {hasRenderableCandidateRows
                  ? formatRecruiterBackgroundSyncLine(authoritativeCandidates.length)
                  : "Live Breezy sync in progress — cached candidates will appear when available"}
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
              onClick={() => {
                if (isBreezySyncPipelineActive()) return;
                const cacheRestored = bootstrapCachedCandidatesView();
                void runBreezySyncPipeline(() => runBackgroundBreezySync(true), {
                  force: true,
                  cacheRestored,
                  duplicateLabel: "refresh-click",
                });
              }}
              className="rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-600/20"
            >
              {candidatesSafeMode.liveSyncPending || refreshingCandidates
                ? "Syncing…"
                : "Refresh / Sync"}
            </button>
            {displaySnapshot ? (
              <p className="text-xs text-zinc-500">Fetched {formatDate(displaySnapshot.fetchedAt)}</p>
            ) : null}
          </div>
        </div>
      </section>

      <CandidateMyQueuePanel
        candidates={candidates}
        rosters={rosters}
        actingRecruiter={actingRecruiter}
        onActingRecruiterChange={setActingRecruiter}
        onOpenCandidate={setSelectedCandidateId}
        onQueueAction={handleQueueAction}
        queueActionBusy={queueActionBusy}
        syncPartial={Boolean(displaySnapshot?.partial)}
        syncStale={Boolean(displaySnapshot?.stale)}
        quickFilter={recruiterQuickFilter}
        onQuickFilterChange={setRecruiterQuickFilter}
      />

      <section
        className={`rounded-2xl border border-zinc-800/60 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm ${
          selectedIds.size > 0 ? "pb-28" : ""
        }`}
      >
        <div className="sticky top-0 z-30 space-y-2 border-b border-zinc-800/80 bg-zinc-900/95 px-3 py-2 backdrop-blur-md sm:px-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-0.5"
              role="group"
              aria-label="Candidate focus mode"
            >
              <button
                type="button"
                onClick={() => handleFocusModeChange("all")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  focusMode === "all"
                    ? "bg-teal-600/25 text-teal-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All candidates
              </button>
              <button
                type="button"
                onClick={() => handleFocusModeChange("my-work")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  focusMode === "my-work"
                    ? "bg-teal-600/25 text-teal-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                My work
              </button>
            </div>
            <div
              className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-0.5"
              role="group"
              aria-label="Table row density"
            >
              <button
                type="button"
                onClick={() => handleTableDensityChange("compact")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  tableDensity === "compact"
                    ? "bg-zinc-700/60 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => handleTableDensityChange("comfortable")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  tableDensity === "comfortable"
                    ? "bg-zinc-700/60 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Comfortable
              </button>
            </div>
            </div>
            <button
              type="button"
              onClick={() => downloadCandidatesCsv(filtered, buildExportMetadata(filtered))}
              disabled={filtered.length === 0}
              className="shrink-0 rounded-lg border border-zinc-600/60 bg-zinc-800/60 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-zinc-700/60 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Export ${filtered.length.toLocaleString()} filtered candidates to CSV`}
            >
              Export Excel
            </button>
          </div>
          {focusMode === "my-work" ? (
            <p className="text-[11px] text-teal-200/90">
              My work — assigned to {actingRecruiter}, follow-up due, paperwork pending, or ready for MEL (
              {filtered.length.toLocaleString()} shown).
            </p>
          ) : null}
          {recruiterQuickFilter !== "all" ? (
            <p className="text-[11px] text-teal-200/90">
              Table filtered by action queue — {filtered.length.toLocaleString()} candidate
              {filtered.length === 1 ? "" : "s"}. Use chips above the queue to change or clear.
            </p>
          ) : null}
          {summaryStripFilter !== "all" ? (
            <p className="text-[11px] text-teal-200/90">
              Summary filter active — {filtered.length.toLocaleString()} candidate
              {filtered.length === 1 ? "" : "s"}. Click the chip again to clear.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
          <input
            className={inputClass}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, position, or source"
          />
          {search.trim() !== debouncedSearch.trim() ? (
            <p className="text-[10px] text-zinc-600">Filtering…</p>
          ) : null}
            </div>
          </div>
          {selectedIds.size > 0 ? (
            <p className="text-[11px] text-teal-200">
              {selectedIds.size} selected — bulk actions bar stays fixed at the bottom.
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
        <div
          className="flex flex-wrap items-center gap-2 border-b border-zinc-800/70 bg-zinc-950/40 px-3 py-2 sm:px-4"
          role="group"
          aria-label="Candidate summary filters"
        >
          {(
            [
              { id: "assigned" as const, label: "Assigned", count: summaryStripCounts.assigned },
              {
                id: "needs-follow-up" as const,
                label: "Needs Follow-Up",
                count: summaryStripCounts.needsFollowUp,
              },
              { id: "paperwork" as const, label: "Paperwork", count: summaryStripCounts.paperwork },
              { id: "ready-mel" as const, label: "Ready for MEL", count: summaryStripCounts.readyMel },
              { id: "unassigned" as const, label: "Unassigned", count: summaryStripCounts.unassigned },
            ] as const
          ).map((chip) => {
            const active = summaryStripFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setSummaryStripFilter((current) => (current === chip.id ? "all" : chip.id))
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-teal-500/50 bg-teal-500/15 text-teal-100"
                    : "border-zinc-700/80 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/80"
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    active ? "bg-teal-500/25 text-teal-50" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {chip.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
        <VirtualCandidateTable
            rows={filtered}
            colSpan={4}
            rowHeightPx={tableRowHeightPx}
            tableMinWidthClass="w-full min-w-full"
            getRowKey={(candidate) => candidate.candidateId}
            renderRow={(candidate) => renderCandidateRow(candidate)}
            header={
              <>
                <colgroup>
                  <col style={{ width: `${CANDIDATE_TABLE_STICKY_CHECKBOX_PX}px` }} />
                  <col style={{ width: identityColPercent }} />
                  <col />
                  <col style={{ width: `${CANDIDATE_TABLE_STICKY_ACTION_PX}px` }} />
                </colgroup>
                <thead className="border-b border-zinc-700/50">
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
                  <CandidateTableSortHeader
                    label="Candidate"
                    sortKey="candidate"
                    activeKey={tableSortKey}
                    direction={tableSortDirection}
                    onSort={handleTableColumnSort}
                    className={stickyIdentityHeaderClass(thClass)}
                  />
                  <CandidateTableSortHeader
                    label="Pipeline signals"
                    sortKey="applied"
                    activeKey={tableSortKey}
                    direction={tableSortDirection}
                    onSort={handleTableColumnSort}
                  />
                  <th className={stickyActionHeaderClass(thClass)}>Actions</th>
                </tr>
              </thead>
              </>
            }
          />
        {filtered.length === 0 ? (
          <p className="border-t border-zinc-800/40 px-3 py-8 text-xs text-zinc-500 sm:px-4">
            {!hasRenderableCandidateRows
              ? CANDIDATES_NO_CACHE_EMPTY_MESSAGE
              : "No candidates match the selected filters."}
          </p>
        ) : null}
      </section>

      {selectedIds.size > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] px-2 sm:px-3 lg:px-4">
          <div className="pointer-events-auto mx-auto max-w-none border border-teal-500/35 bg-zinc-950/98 p-3 shadow-2xl shadow-black/60 backdrop-blur">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-teal-100">
              {selectedIds.size.toLocaleString()} candidate{selectedIds.size === 1 ? "" : "s"} selected
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
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
              defaultValue=""
              disabled={bulkBusy}
              aria-label="Assign recruiter to selected candidates"
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
              <option value="">Assign recruiter…</option>
              {rosters.recruiters.map((recruiter) => (
                <option key={recruiter} value={recruiter}>
                  {recruiter}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
              defaultValue=""
              disabled={bulkBusy}
              aria-label="Assign DM to selected candidates"
              onChange={(event) => {
                const dm = event.target.value;
                if (!dm) return;
                if (!confirmBulkApply(`Assign DM ${dm}`)) {
                  event.target.value = "";
                  return;
                }
                void runBulkUpdate({ assignedDM: dm });
                event.target.value = "";
              }}
            >
              <option value="">Assign DM…</option>
              {rosters.dms.map((dm) => (
                <option key={dm} value={dm}>
                  {dm}
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
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
            >
              Move to Paperwork
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => {
                if (!confirmBulkApply("Mark Ready for MEL")) return;
                void runBulkUpdate({ workflowStatus: "Ready for MEL" });
              }}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
            >
              Ready for MEL
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => {
                const rows = candidates.filter((candidate) => selectedIds.has(candidate.candidateId));
                downloadCandidatesCsv(rows, buildExportMetadata(rows));
              }}
              className="rounded-md border border-zinc-600/60 bg-zinc-800/60 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700/60"
            >
              Export Selected
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => {
                if (!confirmBulkApply("Snooze for 24 hours")) return;
                void runBulkSnooze();
              }}
              className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Snooze 24h
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => {
                if (!confirmBulkApply("Escalate to priority list")) return;
                void runBulkEscalate();
              }}
              className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/20"
            >
              Escalate
            </button>
          </div>
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

      <RecruiterCollapsibleSection
        sectionId="analytics"
        title="Analytics & productivity"
        description="AI prioritization and recruiter productivity — expand when you need reporting detail."
        defaultOpen={false}
      >
        <CandidateAutomationPanels
          queues={prioritizationQueues}
          productivity={recruiterProductivity}
          onOpenCandidate={setSelectedCandidateId}
        />
      </RecruiterCollapsibleSection>

      <RecruiterCollapsibleSection
        sectionId="workflow-buckets"
        title="Workflow buckets"
        description="Grouped counts by lifecycle stage."
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
        sectionId="dd-backfill"
        title="Recent DD backfill queue"
        description="Signed in the last 72 hours without DD requested — manual send only."
        defaultOpen={false}
      >
        <RecentDdBackfillQueue
          candidateNames={backfillCandidateNames}
          onWorkflowUpdated={(workflows) =>
            applyWorkflowsBundle(workflows as CandidateWorkflowState)
          }
          onOpenCandidate={(candidateId) => setSelectedCandidateId(candidateId)}
        />
      </RecruiterCollapsibleSection>

      <RecruiterCollapsibleSection
        sectionId="operational-snapshot"
        title="Operational workflow snapshot"
        description="Recruiter-first counts for active workflow movement and handoff readiness."
        defaultOpen={false}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
      </RecruiterCollapsibleSection>

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

      <CandidatesSyncDiagnosticsPanel />
    </div>
  );
}
