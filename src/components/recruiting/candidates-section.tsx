"use client";

import type { BreezyCandidate, BreezyCandidatesResult } from "@/lib/breezy-api";
import {
  CANDIDATE_WORKFLOW_STATUSES,
  nextActionForWorkflowStatus,
  type CandidateWorkflowRecord,
  type CandidateWorkflowStatus,
  type CandidateWorkflowState,
} from "@/lib/candidate-workflow-types";
import { useEffect, useMemo, useState } from "react";

const ALL = "__all__";
const selectClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";
const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";

type CandidateWorkflowRow = BreezyCandidate & {
  workflowStatus: CandidateWorkflowStatus;
  lastActionAt: string | null;
  nextActionNeeded: string;
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

function formatDateTime(raw: string | null): string {
  if (!raw) return "No local action";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
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
  const [data, setData] = useState<BreezyCandidatesResult | undefined>(undefined);
  const [workflowState, setWorkflowState] = useState<CandidateWorkflowState>({});
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [stageFilter, setStageFilter] = useState(ALL);
  const [positionFilter, setPositionFilter] = useState(ALL);
  const [cityFilter, setCityFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState(ALL);
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [search, setSearch] = useState("");

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
  }, [appliedFrom, appliedTo, candidates, cityFilter, positionFilter, search, sourceFilter, stageFilter, stateFilter]);

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

  function updateWorkflow(candidate: CandidateWorkflowRow, workflowStatus: CandidateWorkflowStatus, note?: string) {
    void fetch("/api/candidates/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateId: candidate.candidateId,
        workflowStatus,
        assignedDM: candidate.assignedDM,
        note,
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
    updateWorkflow(candidate, candidate.workflowStatus, note);
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
            Visibility layer for review, paperwork, MEL loading, and training readiness. Counts are derived from Breezy stage names until workflow persistence is added.
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
          {statusCounts.map((row) => (
            <div key={row.status} className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2">
              <p className="text-xs text-zinc-500">{row.status}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{row.count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="grid gap-3 border-b border-zinc-800/80 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-5">
          <input
            className={`${inputClass} sm:col-span-2 lg:col-span-4`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, position, or source"
          />
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
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-sm text-zinc-500 sm:px-5">No candidates match the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1580px] w-full text-left text-sm">
              <thead className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium sm:px-5">Name</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Email</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Phone</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Source</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Stage</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Applied Date</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Position</th>
                  <th className="px-4 py-3 font-medium sm:px-5">City</th>
                  <th className="px-4 py-3 font-medium sm:px-5">State</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Workflow Status</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Next Action</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Local Actions</th>
                  <th className="px-4 py-3 font-medium sm:px-5">HelloSign Prep</th>
                  <th className="px-4 py-3 font-medium sm:px-5">AI Ready</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map((candidate) => (
                  <tr key={candidate.candidateId} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{candidateName(candidate)}</td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">{candidate.email || "—"}</td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">{candidate.phone || "—"}</td>
                    <td className="px-4 py-3 text-zinc-400 sm:px-5">{candidate.source || "Unknown source"}</td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">{candidate.stage || "Unknown stage"}</td>
                    <td className="px-4 py-3 text-zinc-400 sm:px-5">{formatDate(candidate.appliedDate)}</td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">{candidate.positionName || "Unknown position"}</td>
                    <td className="px-4 py-3 text-zinc-400 sm:px-5">{candidate.city || "—"}</td>
                    <td className="px-4 py-3 text-zinc-400 sm:px-5">{candidate.state || "—"}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${WORKFLOW_STATUS_STYLES[candidate.workflowStatus]}`}>
                        {candidate.workflowStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">
                      <div>{candidate.nextActionNeeded}</div>
                      <div className="mt-1 text-xs text-zinc-500">DM: {candidate.assignedDM}</div>
                      <div className="mt-1 text-xs text-zinc-600">Last action: {formatDateTime(candidate.lastActionAt)}</div>
                      {candidate.notes.length > 0 ? (
                        <div className="mt-1 max-w-[16rem] truncate text-xs text-zinc-500">Note: {candidate.notes[0]}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => updateWorkflow(candidate, "Qualified")} className="rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-200">
                          Mark Qualified
                        </button>
                        <button type="button" onClick={() => updateWorkflow(candidate, "Not Qualified")} className="rounded-md border border-zinc-600 bg-zinc-800/60 px-2 py-1 text-xs font-medium text-zinc-200">
                          Mark Not Qualified
                        </button>
                        <button type="button" onClick={() => updateWorkflow(candidate, "Paperwork Needed")} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-200">
                          Mark Paperwork Needed
                        </button>
                        <button type="button" onClick={() => updateWorkflow(candidate, "Ready for MEL")} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200">
                          Mark Ready for MEL
                        </button>
                        <button type="button" onClick={() => addNote(candidate)} className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-200">
                          Add Note
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <button
                        type="button"
                        disabled
                        title="HelloSign sending is disabled until API keys and packet templates are configured."
                        className="rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-1.5 text-xs font-medium text-zinc-500"
                      >
                        Send Paperwork
                      </button>
                      <p className="mt-1 text-xs text-zinc-600">Placeholder only</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 sm:px-5">
                      <p>Overall: {candidate.overallCandidateScore ?? "Pending"}</p>
                      <p>{candidate.aiRecommendation}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
