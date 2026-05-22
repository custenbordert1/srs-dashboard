"use client";

import {
  JobDraftEditModal,
  JobPushConfirmModal,
  JobPushResultModal,
  JobViewModal,
} from "@/components/recruiting/job-management-modals";
import { JobManagementStatusBadge } from "@/components/recruiting/job-management-status-badge";
import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import {
  buildJobManagementRows,
  sortJobManagementRows,
  type JobManagementRow,
  type JobManagementSortKey,
} from "@/lib/job-management/job-management-rows";
import { fetchJobManagementCatalog } from "@/lib/job-management/job-management-catalog-client";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import type { BreezyPositionVerification } from "@/lib/job-management/breezy-position-payload";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CatalogMeta = {
  fetchedAt: string;
  fromCache: boolean;
  stale?: boolean;
  partial?: boolean;
  refreshError?: string;
  warnings?: string[];
  source: string;
  sourcePath: string;
  companyName?: string;
  publishedCount?: number;
  draftCount?: number;
};

type FeedbackTone = "success" | "error" | "info" | "warning";

type FeedbackMessage = {
  tone: FeedbackTone;
  text: string;
};

const thButtonClass =
  "inline-flex items-center gap-1 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300";

export function JobManagementSection() {
  const [jobs, setJobs] = useState<BreezyJobCatalogRow[]>([]);
  const [drafts, setDrafts] = useState<JobDraft[]>([]);
  const [catalogMeta, setCatalogMeta] = useState<CatalogMeta | null>(null);
  const [syncAlert, setSyncAlert] = useState<FeedbackMessage | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [refreshingJobs, setRefreshingJobs] = useState(false);
  const jobsCountRef = useRef(0);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "push_failed">("all");
  const [sortKey, setSortKey] = useState<JobManagementSortKey>("lastSynced");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [viewRow, setViewRow] = useState<JobManagementRow | null>(null);
  const [editDraftId, setEditDraftId] = useState<string | null>(null);
  const [pushDraftId, setPushDraftId] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<{
    breezyJobId: string;
    verification?: BreezyPositionVerification;
  } | null>(null);

  const editDraft = drafts.find((d) => d.id === editDraftId) ?? null;
  const pushDraft = drafts.find((d) => d.id === pushDraftId) ?? null;

  useEffect(() => {
    jobsCountRef.current = jobs.length;
  }, [jobs.length]);

  const rows = useMemo(() => {
    if (!catalogMeta) return buildJobManagementRows(jobs, drafts, new Date().toISOString());
    return buildJobManagementRows(jobs, drafts, catalogMeta.fetchedAt);
  }, [catalogMeta, drafts, jobs]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [rows, statusFilter]);

  const sortedRows = useMemo(
    () => sortJobManagementRows(filteredRows, sortKey, sortDirection),
    [filteredRows, sortDirection, sortKey],
  );

  const counts = useMemo(
    () => ({
      all: rows.length,
      draft: rows.filter((r) => r.status === "draft").length,
      published: rows.filter((r) => r.status === "published").length,
      push_failed: rows.filter((r) => r.status === "push_failed").length,
    }),
    [rows],
  );

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const res = await fetch("/api/job-management/drafts", { cache: "no-store" });
      const parsed = (await res.json()) as { ok?: boolean; drafts?: JobDraft[] };
      if (parsed.ok && parsed.drafts) setDrafts(parsed.drafts);
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  const applyCatalogMeta = useCallback((parsed: CatalogMeta) => {
    setCatalogMeta(parsed);
    if (parsed.stale || parsed.partial || parsed.refreshError) {
      const parts: string[] = [];
      if (parsed.stale && parsed.refreshError) {
        parts.push(`Showing last synced Breezy jobs — refresh failed: ${parsed.refreshError}`);
      } else if (parsed.stale) {
        parts.push("Showing last synced Breezy jobs while refresh is unavailable.");
      }
      if (parsed.partial && parsed.warnings?.length) {
        parts.push(parsed.warnings.join(" "));
      }
      setSyncAlert({
        tone: parsed.stale ? "warning" : "info",
        text: parts.join(" "),
      });
    } else {
      setSyncAlert(null);
    }
  }, []);

  const loadJobs = useCallback(async (force = false) => {
    const emptyAtStart = jobsCountRef.current === 0;
    if (emptyAtStart) setLoadingJobs(true);
    else setRefreshingJobs(true);

    try {
      const parsed = await fetchJobManagementCatalog({ force });
      if (parsed.ok) {
        setJobs(parsed.jobs);
        applyCatalogMeta({
          fetchedAt: parsed.fetchedAt,
          fromCache: parsed.fromCache,
          stale: parsed.stale,
          partial: parsed.partial,
          refreshError: parsed.refreshError,
          warnings: parsed.warnings,
          source: parsed.source,
          sourcePath: parsed.sourcePath,
          companyName: parsed.companyName,
          publishedCount: parsed.publishedCount,
          draftCount: parsed.draftCount,
        });
        if (force && !parsed.stale && !parsed.partial) {
          setFeedback({
            tone: "success",
            text: `Synced ${parsed.jobs.length.toLocaleString()} Breezy job(s) from ${parsed.source}.`,
          });
        }
        return;
      }

      const message = parsed.error ?? "Failed to load Breezy jobs.";
      if (jobsCountRef.current > 0) {
        setSyncAlert({
          tone: "error",
          text: `${message} Table kept from last successful sync.`,
        });
      } else {
        setSyncAlert(null);
        setFeedback({ tone: "error", text: message });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync Breezy jobs";
      if (jobsCountRef.current > 0) {
        setSyncAlert({ tone: "error", text: `${message} Table kept from last successful sync.` });
      } else {
        setSyncAlert(null);
        setFeedback({ tone: "error", text: message });
      }
    } finally {
      setLoadingJobs(false);
      setRefreshingJobs(false);
    }
  }, [applyCatalogMeta]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadJobs(false);
      void loadDrafts();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadJobs, loadDrafts]);

  const updateDraft = (draftId: string, patch: Partial<JobDraft>) => {
    setDrafts((prev) =>
      prev.map((draft) => (draft.id === draftId ? { ...draft, ...patch } : draft)),
    );
  };

  const saveDraft = async (draft: JobDraft): Promise<JobDraft | null> => {
    const normalized = normalizeJobLocationFields(draft.city, draft.usState);
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      city: normalized.city,
      usState: normalized.usState,
      payRate: draft.payRate.trim(),
      department: draft.department.trim(),
    };
    setSaving(true);
    try {
      const res = await fetch(`/api/job-management/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const parsed = (await res.json()) as { ok?: boolean; draft?: JobDraft; error?: string };
      if (!parsed.ok || !parsed.draft) {
        setFeedback({ tone: "error", text: parsed.error ?? "Save failed" });
        return null;
      }
      setDrafts((prev) => prev.map((d) => (d.id === parsed.draft!.id ? parsed.draft! : d)));
      setFeedback({ tone: "success", text: "Draft saved." });
      return parsed.draft;
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Save failed" });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const pushDraftToBreezy = async (draft: JobDraft) => {
    setPushing(true);
    setFeedback(null);
    try {
      const saved = await saveDraft(draft);
      const draftForPush = saved ?? draft;
      const normalized = normalizeJobLocationFields(draftForPush.city, draftForPush.usState);

      const res = await fetch(`/api/job-management/drafts/${draftForPush.id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          title: draftForPush.title,
          description: draftForPush.description,
          city: normalized.city,
          usState: normalized.usState,
          payRate: draftForPush.payRate,
          department: draftForPush.department,
        }),
      });
      const parsed = (await res.json()) as {
        ok?: boolean;
        draft?: JobDraft;
        breezyJobId?: string;
        error?: string;
        rateLimited?: boolean;
        fieldErrors?: Record<string, string>;
        verification?: BreezyPositionVerification;
      };

      setPushDraftId(null);

      if (!parsed.ok) {
        const fieldHint =
          parsed.fieldErrors && Object.keys(parsed.fieldErrors).length > 0
            ? ` ${Object.values(parsed.fieldErrors).join(" ")}`
            : "";
        setFeedback({
          tone: "error",
          text: parsed.rateLimited
            ? `${parsed.error ?? "Rate limited"} — wait and retry.`
            : `${parsed.error ?? "Push failed"}${fieldHint}`,
        });
        await loadDrafts();
        return;
      }

      setPushResult({
        breezyJobId: parsed.breezyJobId ?? parsed.draft?.breezyJobId ?? "",
        verification: parsed.verification,
      });
      setFeedback({
        tone: parsed.verification?.ok === false ? "warning" : "success",
        text:
          parsed.verification?.ok === false
            ? "Posted to Breezy, but returned location did not fully match the draft."
            : `Push successful. Breezy job ${parsed.breezyJobId ?? ""}`.trim(),
      });
      await loadDrafts();
      // Breezy list APIs can lag briefly after publish; wait before forced catalog refresh.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await loadJobs(true);
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Push failed" });
    } finally {
      setPushing(false);
    }
  };

  const cloneAsDraft = async (breezyJobId: string) => {
    setFeedback(null);
    try {
      const res = await fetch("/api/job-management/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clone", breezyJobId }),
      });
      const parsed = (await res.json()) as {
        ok?: boolean;
        draft?: JobDraft;
        error?: string;
        reused?: boolean;
      };
      if (!parsed.ok || !parsed.draft) {
        setFeedback({ tone: "error", text: parsed.error ?? "Clone failed" });
        return;
      }
      setDrafts((prev) => [parsed.draft!, ...prev.filter((d) => d.id !== parsed.draft!.id)]);
      setEditDraftId(parsed.draft.id);
      setFeedback({
        tone: "info",
        text: parsed.reused
          ? "Opened existing draft clone — continue editing before push."
          : "Cloned as draft — edit city, state, and description before pushing.",
      });
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Clone failed" });
    }
  };

  const deleteDraft = async (draftId: string) => {
    if (!window.confirm("Delete this local draft? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/job-management/drafts/${draftId}`, { method: "DELETE" });
      const parsed = (await res.json()) as { ok?: boolean; error?: string };
      if (!parsed.ok) {
        setFeedback({ tone: "error", text: parsed.error ?? "Delete failed" });
        return;
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      if (editDraftId === draftId) setEditDraftId(null);
      setFeedback({ tone: "success", text: "Draft deleted." });
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Delete failed" });
    }
  };

  function handleSort(key: JobManagementSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "title" || key === "city" || key === "state" || key === "source" ? "asc" : "desc");
  }

  function sortIndicator(key: JobManagementSortKey): string {
    if (sortKey !== key) return "↕";
    return sortDirection === "asc" ? "▲" : "▼";
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Job management</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Table-first workflow: sync Breezy jobs, clone to draft, edit in a modal, and push with
            confirmation. City and state stay in separate fields.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Source:{" "}
            <span className="text-zinc-500">{catalogMeta?.source ?? "Breezy HR API"}</span>
            {catalogMeta?.sourcePath ? (
              <span className="text-zinc-700"> · {catalogMeta.sourcePath}</span>
            ) : null}
          </p>
          {catalogMeta ? (
            <p className="mt-1 text-xs text-zinc-600">
              Last sync: {new Date(catalogMeta.fetchedAt).toLocaleString()}
              {catalogMeta.fromCache ? " · server cache" : " · live"}
              {catalogMeta.stale ? " · stale (refresh failed)" : ""}
              {catalogMeta.partial ? " · partial (draft leg missing)" : ""}
              {catalogMeta.companyName ? ` · ${catalogMeta.companyName}` : ""}
              {catalogMeta.publishedCount != null
                ? ` · ${catalogMeta.publishedCount} published`
                : ""}
              {catalogMeta.draftCount != null && catalogMeta.draftCount > 0
                ? ` · ${catalogMeta.draftCount} draft in Breezy`
                : ""}
              {loadingJobs || refreshingJobs || loadingDrafts ? " · sync in progress…" : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-600">
              {loadingJobs ? "Loading Breezy jobs…" : "No Breezy catalog loaded yet — use Refresh / Sync."}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={loadingJobs || refreshingJobs}
          onClick={() => void loadJobs(true)}
          className="rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-600/20 disabled:opacity-50"
        >
          {loadingJobs || refreshingJobs ? "Syncing…" : "Refresh / Sync"}
        </button>
      </header>

      {syncAlert ? (
        <p
          role={syncAlert.tone === "error" ? "alert" : "status"}
          className={[
            "rounded-lg border px-3 py-2 text-sm",
            syncAlert.tone === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
              : syncAlert.tone === "warning"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                : "border-sky-500/30 bg-sky-500/10 text-sky-100",
          ].join(" ")}
        >
          {syncAlert.text}
        </p>
      ) : null}

      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={[
            "rounded-lg border px-3 py-2 text-sm",
            feedback.tone === "success"
              ? "border-teal-500/30 bg-teal-500/10 text-teal-100"
              : feedback.tone === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                : feedback.tone === "warning"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-100",
          ].join(" ")}
        >
          {feedback.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", `All (${counts.all})`],
            ["draft", `Draft (${counts.draft})`],
            ["published", `Published (${counts.published})`],
            ["push_failed", `Push failed (${counts.push_failed})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setStatusFilter(id)}
            className={[
              "rounded-full border px-3 py-1 text-xs font-medium",
              statusFilter === id
                ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm">
              <tr className="border-b border-zinc-800/80">
                <SortHeader label="Job title" sortKey="title" indicator={sortIndicator("title")} onSort={handleSort} />
                <SortHeader label="City" sortKey="city" indicator={sortIndicator("city")} onSort={handleSort} />
                <SortHeader label="State" sortKey="state" indicator={sortIndicator("state")} onSort={handleSort} />
                <SortHeader label="Status" sortKey="status" indicator={sortIndicator("status")} onSort={handleSort} />
                <SortHeader label="Applicants" sortKey="applicants" indicator={sortIndicator("applicants")} onSort={handleSort} />
                <SortHeader label="Posted date" sortKey="postedDate" indicator={sortIndicator("postedDate")} onSort={handleSort} />
                <SortHeader label="Source" sortKey="source" indicator={sortIndicator("source")} onSort={handleSort} />
                <SortHeader label="Last synced" sortKey="lastSynced" indicator={sortIndicator("lastSynced")} onSort={handleSort} />
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loadingJobs && jobs.length === 0 && sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                    Loading jobs from Breezy…
                  </td>
                </tr>
              ) : null}
              {refreshingJobs && sortedRows.length > 0 ? (
                <tr className="bg-teal-950/20">
                  <td colSpan={9} className="px-4 py-1.5 text-center text-[11px] text-teal-200/80">
                    Refreshing Breezy catalog — table stays visible
                  </td>
                </tr>
              ) : null}
              {!loadingJobs && sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                    No jobs match this filter.
                  </td>
                </tr>
              ) : null}
              {sortedRows.map((row) => (
                <tr key={row.rowId} className="hover:bg-zinc-800/25">
                  <td className="px-3 py-2.5 font-medium text-zinc-100">{row.title}</td>
                  <td className="px-3 py-2.5 text-zinc-300">{row.city || "—"}</td>
                  <td className="px-3 py-2.5 text-zinc-300">{row.state || "—"}</td>
                  <td className="px-3 py-2.5">
                    <JobManagementStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                    {row.applicants ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-500">
                    {row.postedDate ? new Date(row.postedDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-400">{row.source}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-500">
                    {row.lastSynced ? new Date(row.lastSynced).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <ActionButton label="View" onClick={() => setViewRow(row)} />
                      {row.editable && row.draft ? (
                        <ActionButton label="Edit" onClick={() => setEditDraftId(row.draft!.id)} />
                      ) : null}
                      {row.canClone && row.breezyJobId ? (
                        <ActionButton label="Clone" onClick={() => void cloneAsDraft(row.breezyJobId!)} />
                      ) : null}
                      {row.canPush && row.draft ? (
                        <ActionButton label="Push" onClick={() => setPushDraftId(row.draft!.id)} />
                      ) : null}
                      {row.canDelete && row.draftId ? (
                        <ActionButton label="Delete" onClick={() => void deleteDraft(row.draftId!)} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {viewRow ? <JobViewModal row={viewRow} onClose={() => setViewRow(null)} /> : null}
      {editDraft ? (
        <JobDraftEditModal
          draft={editDraft}
          saving={saving}
          onClose={() => setEditDraftId(null)}
          onChange={(patch) => updateDraft(editDraft.id, patch)}
          onSave={() => void saveDraft(editDraft)}
          onPush={() => {
            setPushDraftId(editDraft.id);
          }}
        />
      ) : null}
      {pushDraft ? (
        <JobPushConfirmModal
          draft={pushDraft}
          pushing={pushing}
          onClose={() => setPushDraftId(null)}
          onConfirm={() => {
            const latest = drafts.find((d) => d.id === pushDraftId);
            if (latest) void pushDraftToBreezy(latest);
          }}
        />
      ) : null}
      {pushResult ? (
        <JobPushResultModal
          breezyJobId={pushResult.breezyJobId}
          verification={pushResult.verification}
          onClose={() => setPushResult(null)}
        />
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  indicator,
  onSort,
}: {
  label: string;
  sortKey: JobManagementSortKey;
  indicator: string;
  onSort: (key: JobManagementSortKey) => void;
}) {
  return (
    <th className="px-0 py-0">
      <button type="button" className={thButtonClass} onClick={() => onSort(sortKey)}>
        {label}
        <span className="text-[9px] text-zinc-600">{indicator}</span>
      </button>
    </th>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
    >
      {label}
    </button>
  );
}
