"use client";

import type { BreezyCandidate, BreezyCandidatesResult } from "@/lib/breezy-api";
import {
  CANDIDATE_WORKFLOW_STATUSES,
  nextActionForWorkflowStatus,
  type CandidateWorkflowRecord,
  type CandidateWorkflowStatus,
  type CandidateWorkflowState,
} from "@/lib/candidate-workflow-types";
import { CandidateDetailDrawer } from "@/components/recruiting/candidate-detail-drawer";
import { useEffect, useMemo, useRef, useState } from "react";

const ALL = "__all__";
const selectClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";
const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";
const thClass =
  "sticky top-0 z-10 whitespace-nowrap bg-zinc-900/95 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 backdrop-blur-sm";
const tdClass = "whitespace-nowrap px-2 py-1 text-xs text-zinc-300";

type CandidateWorkflowRow = BreezyCandidate & {
  workflowStatus: CandidateWorkflowStatus;
  lastActionAt: string | null;
  nextActionNeeded: string;
  assignedRecruiter: string;
  assignedDM: string;
  notes: string[];
  history: CandidateWorkflowRecord["history"];
  resumeKeywordScore: number | null;
  merchandisingExperienceScore: number | null;
  retailExperienceScore: number | null;
  travelFitScore: number | null;
  overallCandidateScore: number | null;
  aiRecommendation: string;
};

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

function stageIncludes(candidate: BreezyCandidate, words: string[]): boolean {
  const stage = candidate.stage.toLowerCase();
  return words.some((word) => stage.includes(word));
}

function deriveWorkflowStatus(candidate: BreezyCandidate): CandidateWorkflowStatus {
  if (stageIncludes(candidate, ["active rep", "active"])) return "Active Rep";
  if (stageIncludes(candidate, ["loaded in mel", "loaded"])) return "Loaded in MEL";
  if (stageIncludes(candidate, ["training"])) return "Training Needed";
  if (stageIncludes(candidate, ["ready for mel", "signed"])) return "Ready for MEL";
  if (stageIncludes(candidate, ["paperwork sent", "document sent"])) return "Paperwork Sent";
  if (stageIncludes(candidate, ["paperwork", "hellosign", "offer"])) return "Paperwork Needed";
  if (stageIncludes(candidate, ["qualified", "interview", "screen", "assessment"])) return "Qualified";
  if (stageIncludes(candidate, ["rejected", "disqualified", "not qualified", "archived"])) return "Not Qualified";
  if (stageIncludes(candidate, ["applied", "new"])) return "Applied";
  return "Needs Review";
}

function workflowRow(candidate: BreezyCandidate, local?: CandidateWorkflowRecord): CandidateWorkflowRow {
  const workflowStatus = local?.workflowStatus ?? deriveWorkflowStatus(candidate);
  const seededScore = candidate.score ?? null;
  return {
    ...candidate,
    workflowStatus,
    lastActionAt: local?.lastActionAt ?? null,
    nextActionNeeded: local?.nextActionNeeded ?? nextActionForWorkflowStatus(workflowStatus),
    assignedRecruiter: local?.assignedRecruiter ?? "Unassigned",
    assignedDM: local?.assignedDM ?? "Unassigned",
    notes: local?.notes ?? [],
    history: local?.history ?? [],
    resumeKeywordScore: null,
    merchandisingExperienceScore: null,
    retailExperienceScore: null,
    travelFitScore: null,
    overallCandidateScore: seededScore,
    aiRecommendation: "Pending AI scoring",
  };
}

function sourceBreakdown(candidates: CandidateWorkflowRow[]): Array<{ source: string; count: number }> {
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

function workflowBuckets(candidates: CandidateWorkflowRow[]) {
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

type CandidateAction =
  | { kind: "status"; status: CandidateWorkflowStatus; label: string }
  | { kind: "assign-recruiter" | "assign-dm" | "add-note"; label: string };

const CANDIDATE_ACTIONS: CandidateAction[] = [
  { kind: "status", status: "Needs Review", label: "Needs Review" },
  { kind: "status", status: "Qualified", label: "Qualified" },
  { kind: "status", status: "Not Qualified", label: "Not Qualified" },
  { kind: "status", status: "Paperwork Needed", label: "Paperwork Needed" },
  { kind: "status", status: "Paperwork Sent", label: "Paperwork Sent" },
  { kind: "status", status: "Signed", label: "Signed" },
  { kind: "status", status: "Ready for MEL", label: "Ready for MEL" },
  { kind: "status", status: "Training Needed", label: "Training Needed" },
  { kind: "status", status: "Active Rep", label: "Active Rep" },
  { kind: "assign-recruiter", label: "Assign Recruiter" },
  { kind: "assign-dm", label: "Assign DM" },
  { kind: "add-note", label: "Add Note" },
];

function CandidateActionsMenu({ onAction }: { onAction: (action: CandidateAction) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="rounded-md border border-zinc-600 bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-700/80"
      >
        Actions
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-md border border-zinc-700 bg-zinc-950 py-1 shadow-lg shadow-black/40"
        >
          {CANDIDATE_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className="block w-full px-2.5 py-1 text-left text-[11px] text-zinc-200 hover:bg-zinc-800/80"
              onClick={() => {
                setOpen(false);
                onAction(action);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CandidatesSection() {
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
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [candidateRes, workflowRes] = await Promise.all([
          fetch("/api/breezy/candidates", { cache: "no-store" }),
          fetch("/api/candidates/workflows", { cache: "no-store" }),
        ]);
        const candidateContentType = candidateRes.headers.get("content-type") ?? "";
        if (!candidateContentType.includes("application/json")) {
          throw new Error(`Breezy candidates returned HTTP ${candidateRes.status} instead of dashboard data.`);
        }
        const parsed = (await candidateRes.json()) as BreezyCandidatesResult;
        const workflowParsed = (await workflowRes.json()) as {
          ok: boolean;
          workflows?: CandidateWorkflowState;
        };
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
    () => (data?.ok ? data.candidates.map((candidate) => workflowRow(candidate, workflowState[candidate.candidateId])) : []),
    [data, workflowState],
  );
  const sourceOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.source)), [candidates]);
  const stageOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.stage)), [candidates]);
  const positionOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.positionName)), [candidates]);
  const cityOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.city)), [candidates]);
  const stateOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.state)), [candidates]);

  const filtered = useMemo(() => {
    const fromDate = appliedFrom ? new Date(`${appliedFrom}T00:00:00`) : null;
    const toDate = appliedTo ? new Date(`${appliedTo}T23:59:59`) : null;
    const q = search.trim().toLowerCase();

    return candidates.filter((candidate) => {
      if (sourceFilter !== ALL && candidate.source !== sourceFilter) return false;
      if (stageFilter !== ALL && candidate.stage !== stageFilter) return false;
      if (positionFilter !== ALL && candidate.positionName !== positionFilter) return false;
      if (cityFilter !== ALL && candidate.city !== cityFilter) return false;
      if (stateFilter !== ALL && candidate.state !== stateFilter) return false;
      if (workflowFilter !== ALL && candidate.workflowStatus !== workflowFilter) return false;

      const appliedDate = parseDate(candidate.appliedDate);
      if (fromDate && (!appliedDate || appliedDate < fromDate)) return false;
      if (toDate && (!appliedDate || appliedDate > toDate)) return false;
      if (q) {
        const haystack = [
          candidateName(candidate),
          candidate.email,
          candidate.phone,
          candidate.positionName,
          candidate.source,
          candidate.stage,
          candidate.city,
          candidate.state,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [appliedFrom, appliedTo, candidates, cityFilter, positionFilter, search, sourceFilter, stageFilter, stateFilter, workflowFilter]);

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

  function toggleWorkflowStatusFilter(status: CandidateWorkflowStatus) {
    setWorkflowFilter((current) => (current === status ? ALL : status));
  }

  function updateWorkflow(
    candidate: CandidateWorkflowRow,
    workflowStatus: CandidateWorkflowStatus,
    options: { note?: string; assignedRecruiter?: string; assignedDM?: string } = {},
  ) {
    void fetch("/api/candidates/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateId: candidate.candidateId,
        workflowStatus,
        assignedRecruiter: options.assignedRecruiter ?? candidate.assignedRecruiter,
        assignedDM: options.assignedDM ?? candidate.assignedDM,
        note: options.note,
      }),
    })
      .then(async (res) => {
        const parsed = (await res.json()) as { ok: boolean; workflow?: CandidateWorkflowRecord; error?: string };
        if (!res.ok || !parsed.ok || !parsed.workflow) {
          throw new Error(parsed.error ?? `Workflow update failed with HTTP ${res.status}`);
        }
        setWorkflowState((prev) => ({
          ...prev,
          [parsed.workflow!.candidateId]: parsed.workflow!,
        }));
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : "Workflow update failed");
      });
  }

  function addNote(candidate: CandidateWorkflowRow) {
    const note = window.prompt("Add local workflow note");
    if (!note?.trim()) return;
    updateWorkflow(candidate, candidate.workflowStatus, { note });
  }

  function assignRecruiter(candidate: CandidateWorkflowRow) {
    const assignedRecruiter = window.prompt("Assign recruiter", candidate.assignedRecruiter);
    if (!assignedRecruiter?.trim()) return;
    updateWorkflow(candidate, candidate.workflowStatus, { assignedRecruiter });
  }

  function assignDm(candidate: CandidateWorkflowRow) {
    const assignedDM = window.prompt("Assign DM", candidate.assignedDM);
    if (!assignedDM?.trim()) return;
    updateWorkflow(candidate, candidate.workflowStatus, { assignedDM });
  }

  function handleCandidateAction(candidate: CandidateWorkflowRow, action: CandidateAction) {
    if (action.kind === "status") {
      updateWorkflow(candidate, action.status);
      return;
    }
    if (action.kind === "assign-recruiter") {
      assignRecruiter(candidate);
      return;
    }
    if (action.kind === "assign-dm") {
      assignDm(candidate);
      return;
    }
    addNote(candidate);
  }

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
          <div className="max-h-[min(70vh,960px)] overflow-auto">
            <table className="min-w-[1500px] w-full text-left">
              <thead className="border-b border-zinc-800/80">
                <tr>
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
                  <th className={thClass}>AI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map((candidate) => {
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
                  >
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
                    <td
                      className={`${tdClass} text-zinc-500 underline-offset-2 hover:underline`}
                      title="Open candidate drawer"
                    >
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
                    <td className={`${tdClass} text-[10px] text-zinc-500`}>
                      <span className="block">{candidate.overallCandidateScore ?? "—"}</span>
                      <span className="block max-w-[8rem] truncate">{candidate.aiRecommendation}</span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CandidateDetailDrawer
        candidate={selectedCandidate}
        open={selectedCandidate !== null}
        onClose={() => setSelectedCandidateId(null)}
        statusAgingDays={
          selectedCandidate ? daysSince(selectedCandidate.lastActionAt ?? selectedCandidate.appliedDate) : null
        }
        appliedAgingDays={selectedCandidate ? daysSince(selectedCandidate.appliedDate) : null}
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
      />
    </div>
  );
}
