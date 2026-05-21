"use client";

import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import { validateJobDraftForBreezyPush } from "@/lib/job-management/breezy-position-payload";
import { useCallback, useEffect, useMemo, useState } from "react";

type CatalogResponse =
  | {
      ok: true;
      jobs: BreezyJobCatalogRow[];
      fetchedAt: string;
      fromCache: boolean;
    }
  | { ok: false; error: string };

export function JobManagementSection() {
  const [jobs, setJobs] = useState<BreezyJobCatalogRow[]>([]);
  const [drafts, setDrafts] = useState<JobDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [catalogMeta, setCatalogMeta] = useState<{ fetchedAt: string; fromCache: boolean } | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedDraft = drafts.find((d) => d.id === selectedDraftId) ?? null;

  const pushValidation = useMemo(
    () => (selectedDraft ? validateJobDraftForBreezyPush(selectedDraft) : null),
    [selectedDraft],
  );
  const canPushToBreezy = pushValidation?.ok === true;

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

  const loadJobs = useCallback(async (force = false) => {
    setLoadingJobs(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-management/breezy-jobs${force ? "?force=true" : ""}`, {
        cache: "no-store",
      });
      const parsed = (await res.json()) as CatalogResponse;
      if (!res.ok || !parsed.ok) {
        setError(parsed.ok ? "Failed to load jobs" : parsed.error ?? `HTTP ${res.status}`);
        return;
      }
      setJobs(parsed.jobs);
      setCatalogMeta({ fetchedAt: parsed.fetchedAt, fromCache: parsed.fromCache });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync Breezy jobs");
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadJobs(false);
      void loadDrafts();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadJobs, loadDrafts]);

  const cloneAsDraft = async (breezyJobId: string) => {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/job-management/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clone", breezyJobId }),
      });
      const parsed = (await res.json()) as { ok?: boolean; draft?: JobDraft; error?: string };
      if (!parsed.ok || !parsed.draft) {
        setError(parsed.error ?? "Clone failed");
        return;
      }
      setDrafts((prev) => [parsed.draft!, ...prev]);
      setSelectedDraftId(parsed.draft.id);
      setMessage("Cloned as DRAFT — edit before pushing to Breezy.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clone failed");
    }
  };

  const saveDraft = async (draft = selectedDraft): Promise<JobDraft | null> => {
    if (!draft || draft.status !== "draft") return null;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-management/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          city: draft.city,
          usState: draft.usState,
          payRate: draft.payRate,
          department: draft.department,
        }),
      });
      const parsed = (await res.json()) as { ok?: boolean; draft?: JobDraft; error?: string };
      if (!parsed.ok || !parsed.draft) {
        setError(parsed.error ?? "Save failed");
        return null;
      }
      setDrafts((prev) => prev.map((d) => (d.id === parsed.draft!.id ? parsed.draft! : d)));
      setMessage("Draft saved.");
      return parsed.draft;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const pushToBreezy = async () => {
    if (!selectedDraft || selectedDraft.status !== "draft") return;

    const validation = validateJobDraftForBreezyPush(selectedDraft);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setPushing(true);
    setError(null);
    try {
      const saved = await saveDraft(selectedDraft);
      const draftForPush = saved ?? selectedDraft;

      const res = await fetch(`/api/job-management/drafts/${draftForPush.id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          title: draftForPush.title,
          description: draftForPush.description,
          city: draftForPush.city,
          usState: draftForPush.usState,
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
      };
      if (!parsed.ok) {
        const fieldHint =
          parsed.fieldErrors && Object.keys(parsed.fieldErrors).length > 0
            ? ` ${Object.values(parsed.fieldErrors).join(" ")}`
            : "";
        setError(
          parsed.rateLimited
            ? `${parsed.error ?? "Rate limited"} — wait and retry.`
            : `${parsed.error ?? "Push failed"}${fieldHint}`,
        );
        await loadDrafts();
        return;
      }
      setPushModalOpen(false);
      setMessage(`Posted to Breezy. Job ID: ${parsed.breezyJobId ?? parsed.draft?.breezyJobId ?? "—"}`);
      await loadDrafts();
      if (parsed.draft) setSelectedDraftId(parsed.draft.id);
      void loadJobs(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setPushing(false);
    }
  };

  const updateDraftField = (field: keyof JobDraft, value: string) => {
    if (!selectedDraftId) return;
    setDrafts((prev) =>
      prev.map((d) => (d.id === selectedDraftId ? { ...d, [field]: value } : d)),
    );
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Job management</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Sync published Breezy job ads, clone to local drafts, edit, then push to Breezy only after
            explicit confirmation. No automatic posting.
          </p>
          {catalogMeta ? (
            <p className="mt-2 text-xs text-zinc-600">
              Last sync: {new Date(catalogMeta.fetchedAt).toLocaleString()}
              {catalogMeta.fromCache ? " (cached)" : ""}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={loadingJobs}
          onClick={() => void loadJobs(true)}
          className="rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-600/20 disabled:opacity-50"
        >
          {loadingJobs ? "Syncing…" : "Refresh Breezy jobs"}
        </button>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-100">
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
          <div className="border-b border-zinc-800/80 px-4 py-3">
            <h3 className="font-semibold text-zinc-100">Active Breezy jobs</h3>
            <p className="text-xs text-zinc-500">Published positions from Breezy (read-only sync)</p>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-950/95 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Applicants</th>
                  <th className="px-4 py-2">Posted</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {loadingJobs && jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                      Loading published jobs…
                    </td>
                  </tr>
                ) : null}
                {jobs.map((job) => (
                  <tr key={job.breezyJobId} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-medium text-zinc-100">{job.title}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {job.displayLocation || [job.city, job.usState].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{job.pipelineStatus}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                      {job.applicantCount ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {job.postedDate ? new Date(job.postedDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void cloneAsDraft(job.breezyJobId)}
                        className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                      >
                        Clone as draft
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <div>
            <h3 className="font-semibold text-zinc-100">Draft jobs</h3>
            <p className="text-xs text-zinc-500">
              {loadingDrafts ? "Loading…" : `${drafts.length} draft(s) — labeled DRAFT until pushed`}
            </p>
          </div>

          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {drafts.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDraftId(d.id)}
                  className={[
                    "w-full rounded-lg px-2 py-1.5 text-left",
                    selectedDraftId === d.id ? "bg-teal-500/15 text-teal-100" : "text-zinc-300 hover:bg-zinc-800",
                  ].join(" ")}
                >
                  <span className="font-medium">{d.title}</span>
                  <span className="ml-2 text-[10px] uppercase text-amber-400/90">{d.status}</span>
                </button>
              </li>
            ))}
          </ul>

          {selectedDraft ? (
            <div className="space-y-3 border-t border-zinc-800/80 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Draft — not posted</p>
              <label className="block text-xs text-zinc-500">
                Title
                <input
                  value={selectedDraft.title}
                  disabled={selectedDraft.status !== "draft"}
                  onChange={(e) => updateDraftField("title", e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                City / State
                <div className="mt-1 flex gap-2">
                  <input
                    value={selectedDraft.city}
                    disabled={selectedDraft.status !== "draft"}
                    onChange={(e) => updateDraftField("city", e.target.value)}
                    className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                  />
                  <input
                    value={selectedDraft.usState}
                    disabled={selectedDraft.status !== "draft"}
                    onChange={(e) => updateDraftField("usState", e.target.value)}
                    className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                  />
                </div>
              </label>
              <label className="block text-xs text-zinc-500">
                Pay rate
                <input
                  value={selectedDraft.payRate}
                  disabled={selectedDraft.status !== "draft"}
                  onChange={(e) => updateDraftField("payRate", e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Department
                <input
                  value={selectedDraft.department}
                  disabled={selectedDraft.status !== "draft"}
                  onChange={(e) => updateDraftField("department", e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Description
                <textarea
                  value={selectedDraft.description}
                  disabled={selectedDraft.status !== "draft"}
                  onChange={(e) => updateDraftField("description", e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                />
              </label>
              {selectedDraft.breezyJobId ? (
                <p className="text-xs text-zinc-500">Breezy ID: {selectedDraft.breezyJobId}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {selectedDraft.status === "draft" ? (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveDraft()}
                      className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save draft"}
                    </button>
                    <button
                      type="button"
                      disabled={!canPushToBreezy}
                      title={
                        canPushToBreezy
                          ? "Post edited draft to Breezy"
                          : "Enter city and a valid US state before pushing"
                      }
                      onClick={() => setPushModalOpen(true)}
                      className="rounded-lg border border-teal-600/50 bg-teal-600/15 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-600/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Push to Breezy
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Select a draft or clone a published job.</p>
          )}
        </section>
      </div>

      {pushModalOpen && selectedDraft?.status === "draft" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="push-confirm-title"
        >
          <div className="max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
            <h3 id="push-confirm-title" className="text-lg font-semibold text-zinc-50">
              Confirm push to Breezy
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              This will create a new position in Breezy. Review details before confirming.
            </p>
            {pushValidation && !pushValidation.ok ? (
              <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {pushValidation.message}
                {pushValidation.errors.city ? ` ${pushValidation.errors.city}` : ""}
                {pushValidation.errors.usState ? ` ${pushValidation.errors.usState}` : ""}
              </p>
            ) : null}
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-zinc-500">Title</dt>
                <dd className="text-zinc-100">{selectedDraft.title}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Location</dt>
                <dd className="text-zinc-100">
                  {[selectedDraft.city, selectedDraft.usState].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Pay rate</dt>
                <dd className="text-zinc-100">{selectedDraft.payRate || "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Description preview</dt>
                <dd className="max-h-32 overflow-auto rounded border border-zinc-800 bg-zinc-950/80 p-2 text-xs text-zinc-300">
                  {selectedDraft.description.trim() || "(empty)"}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPushModalOpen(false)}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pushing || !canPushToBreezy}
                onClick={() => void pushToBreezy()}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
              >
                {pushing ? "Saving & posting…" : "Confirm and post"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
