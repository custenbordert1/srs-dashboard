"use client";

import type { BreezyCandidate, BreezyCandidatesResult } from "@/lib/breezy-api";
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
import {
  getRecruitingActions,
  toggleRecruitingAction,
  type RecruitingActionType,
} from "@/lib/candidate-recruiting-actions";
import { VirtualCandidateTable } from "@/components/recruiting/virtual-candidate-table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMelOpportunities } from "@/hooks/use-mel-opportunities";
import { matchCandidateToOpportunities } from "@/lib/mel-matching/matching-engine";
import { AI_GRADE_STYLES, type WorkflowRecommendation } from "@/lib/candidate-ai-scoring";
import { buildPrioritizationQueues } from "@/lib/candidate-prioritization";
import {
  buildScoredWorkflowRow,
  type ScoredCandidateWorkflowRow,
} from "@/lib/build-candidate-workflow-row";
import { isAppliedDateInRange } from "@/lib/breezy-api";
import { fetchCachedBreezyCandidates } from "@/lib/cached-breezy-client";
import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { buildRecruiterProductivity } from "@/lib/recruiter-productivity";
import { loadRecruiterRoster } from "@/lib/recruiter-roster";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function CandidatesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-20 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
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
  const [data, setData] = useState<BreezyCandidatesResult | undefined>(undefined);
  const [workflowState, setWorkflowState] = useState<CandidateWorkflowState>({});
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [stageFilter, setStageFilter] = useState(ALL);
  const [positionFilter, setPositionFilter] = useState(ALL);
  const [cityFilter, setCityFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState(ALL);
  const [workflowFilter, setWorkflowFilter] = useState(ALL);
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [parsed, workflowParsed] = await Promise.all([
          fetchCachedBreezyCandidates(),
          fetchCachedJson(
            cacheKey(["candidates", "workflows"]),
            async () => {
              const workflowRes = await fetchWithRetry("/api/candidates/workflows", {
                cache: "no-store",
              });
              return (await workflowRes.json()) as {
                ok: boolean;
                workflows?: CandidateWorkflowState;
              };
            },
            { ttlMs: LONG_CLIENT_CACHE_TTL_MS, label: "candidate-workflows" },
          ),
        ]);
        if (!cancelled) {
          setData(parsed);
          setWorkflowState(workflowParsed.ok && workflowParsed.workflows ? workflowParsed.workflows : {});
        }
      } catch (err) {
        if (!cancelled) {
          setData({
            ok: false,
            error: err instanceof Error ? err.message : "Failed to load Breezy candidates",
            fetchedAt: new Date().toISOString(),
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const candidates = useMemo(
    () =>
      data?.ok
        ? data.candidates.map((candidate) => buildScoredWorkflowRow(candidate, workflowState[candidate.candidateId]))
        : [],
    [data, workflowState],
  );
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
    const q = debouncedSearch.trim().toLowerCase();

    return candidates.filter((candidate) => {
      if (sourceFilter !== ALL && candidate.source !== sourceFilter) return false;
      if (stageFilter !== ALL && candidate.stage !== stageFilter) return false;
      if (positionFilter !== ALL && candidate.positionName !== positionFilter) return false;
      if (cityFilter !== ALL && candidate.city !== cityFilter) return false;
      if (stateFilter !== ALL && candidate.state !== stateFilter) return false;
      if (workflowFilter !== ALL && candidate.workflowStatus !== workflowFilter) return false;

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
  }, [
    appliedFrom,
    appliedTo,
    candidates,
    cityFilter,
    debouncedSearch,
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

  const [recruitingActionsTick, setRecruitingActionsTick] = useState(0);

  const selectedCandidate = useMemo(
    () => (selectedCandidateId ? (candidates.find((c) => c.candidateId === selectedCandidateId) ?? null) : null),
    [candidates, selectedCandidateId],
  );

  const selectedDrawerRow = useMemo(() => {
    if (!selectedCandidate) return null;
    const row = buildCandidateDrawerRowFromScored(selectedCandidate, {
      recruitingActions: getRecruitingActions(selectedCandidate.candidateId),
    });
    const breezy =
      data?.ok === true
        ? data.candidates.find((c) => c.candidateId === selectedCandidate.candidateId)
        : undefined;
    if (!breezy || melOpportunities.length === 0) return row;
    const melMatch = matchCandidateToOpportunities(breezy, melOpportunities);
    return {
      ...row,
      matchedOpportunities: melMatch.matches,
      melMatchingSummary: melMatch.aiSummary,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick refreshes local recruiting flags
  }, [data, melOpportunities, selectedCandidate, recruitingActionsTick]);

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
    const parsed = (await res.json()) as { ok: boolean; workflow?: CandidateWorkflowRecord; error?: string };
    if (!res.ok || !parsed.ok || !parsed.workflow) {
      throw new Error(parsed.error ?? `Workflow update failed with HTTP ${res.status}`);
    }
    return parsed.workflow;
  }

  function applyWorkflowRecord(workflow: CandidateWorkflowRecord) {
    setWorkflowState((prev) => ({ ...prev, [workflow.candidateId]: workflow }));
  }

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
      updateWorkflow(candidate, candidate.workflowStatus, { note: action.note });
    },
    // updateWorkflow is stable for this component instance (uses setState only).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [],
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
            <CandidateActionsMenu onAction={(action) => handleCandidateAction(candidate, action)} />
          </td>
          <td className={`${tdClass} text-zinc-500 underline-offset-2 hover:underline`} title="Open candidate drawer">
            Notes: {candidate.notes.length}
          </td>
          <td className={tdClass} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              disabled
              title="HelloSign sending is disabled until API keys and packet templates are configured."
              className="rounded border border-zinc-700 bg-zinc-950/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
            >
              Send
            </button>
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
    [handleCandidateAction, selectedCandidateId, selectedIds, toggleSelectCandidate],
  );

  if (data === undefined) return <CandidatesSkeleton />;

  if (!data.ok) {
    return (
      <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 sm:p-5">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Candidates</h1>
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {data.error}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Candidates</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500">
              Clean live Breezy candidates for local dashboard review. Raw Breezy payloads, resume bodies, and HTML are not rendered.
            </p>
          </div>
          <p className="text-xs text-zinc-500">Fetched {formatDate(data.fetchedAt)}</p>
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
                {loadRecruiterRoster().map((recruiter) => (
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
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
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-xs text-zinc-500 sm:px-4">No candidates match the selected filters.</p>
        ) : (
          <VirtualCandidateTable
            rows={filtered}
            colSpan={18}
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
        onRecruitingAction={(type: RecruitingActionType) => {
          if (!selectedCandidate) return;
          toggleRecruitingAction(selectedCandidate.candidateId, type);
          setRecruitingActionsTick((n) => n + 1);
        }}
        melMatchesLoading={melLoading}
      />
    </div>
  );
}
