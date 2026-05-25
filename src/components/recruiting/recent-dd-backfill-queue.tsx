"use client";

import type { DirectDepositBackfillRow } from "@/lib/direct-deposit-backfill";
import { directDepositStatusLabel } from "@/lib/direct-deposit-types";
import { useCallback, useEffect, useMemo, useState } from "react";

type BackfillApiRow = DirectDepositBackfillRow;

type RecentDdBackfillQueueProps = {
  candidateNames: Record<string, string>;
  onWorkflowUpdated?: (workflows: Record<string, unknown>) => void;
  onOpenCandidate?: (candidateId: string) => void;
};

function formatSignedAt(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function RecentDdBackfillQueue({
  candidateNames,
  onWorkflowUpdated,
  onOpenCandidate,
}: RecentDdBackfillQueueProps) {
  const [rows, setRows] = useState<BackfillApiRow[]>([]);
  const [windowHours, setWindowHours] = useState(72);
  const [deliveryMode, setDeliveryMode] = useState<"log" | "resend">("log");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/direct-deposit/backfill", { cache: "no-store" });
      const parsed = (await res.json()) as {
        ok: boolean;
        rows?: BackfillApiRow[];
        windowHours?: number;
        deliveryMode?: "log" | "resend";
        error?: string;
      };
      if (!res.ok || !parsed.ok || !parsed.rows) {
        throw new Error(parsed.error ?? `Failed to load backfill queue (${res.status})`);
      }
      setRows(parsed.rows);
      setWindowHours(parsed.windowHours ?? 72);
      setDeliveryMode(parsed.deliveryMode === "resend" ? "resend" : "log");
      setSelected((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (parsed.rows!.some((row) => row.candidateId === id && row.eligible)) {
            next.add(id);
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load backfill queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const eligibleRows = useMemo(() => rows.filter((row) => row.eligible), [rows]);
  const selectedEligible = useMemo(
    () => eligibleRows.filter((row) => selected.has(row.candidateId)),
    [eligibleRows, selected],
  );

  async function sendOne(row: BackfillApiRow) {
    setBusyId(row.candidateId);
    try {
      const res = await fetch("/api/onboarding/direct-deposit/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", candidateId: row.candidateId }),
      });
      const parsed = (await res.json()) as {
        ok: boolean;
        workflows?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok || !parsed.ok) {
        throw new Error(parsed.error ?? `Send failed (${res.status})`);
      }
      if (parsed.workflows) onWorkflowUpdated?.(parsed.workflows);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusyId(null);
    }
  }

  async function sendBulkConfirmed() {
    setConfirmBulkOpen(false);
    if (selectedEligible.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/onboarding/direct-deposit/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-bulk",
          candidateIds: selectedEligible.map((row) => row.candidateId),
        }),
      });
      const parsed = (await res.json()) as {
        ok: boolean;
        results?: Array<{ candidateId: string; ok: boolean; error?: string }>;
        workflows?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok || !parsed.ok) {
        throw new Error(parsed.error ?? `Bulk send failed (${res.status})`);
      }
      if (parsed.workflows) onWorkflowUpdated?.(parsed.workflows);
      const failed = parsed.results?.filter((r) => !r.ok) ?? [];
      if (failed.length > 0) {
        window.alert(
          `${failed.length} of ${selectedEligible.length} sends failed. First error: ${failed[0]?.error ?? "unknown"}`,
        );
      }
      setSelected(new Set());
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Bulk send failed");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelect(candidateId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  if (loading && rows.length === 0 && !error) {
    return (
      <section className="rounded-xl border border-violet-500/20 bg-zinc-900/40 p-4">
        <p className="text-sm text-zinc-500">Loading recent DD backfill queue…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-violet-500/25 bg-zinc-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-violet-100">Recent DD backfill queue</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-500">
            Signed in the last {windowHours} hours with DD not yet requested. Manual send only — no
            automatic bulk email. Delivery mode: <span className="text-zinc-300">{deliveryMode}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || bulkBusy}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="mt-3 text-xs text-red-300/90">{error}</p> : null}

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-600">No candidates in the 72-hour backfill window.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy || selectedEligible.length === 0}
              onClick={() => setConfirmBulkOpen(true)}
              className="rounded-md border border-teal-600/40 bg-teal-600/10 px-2 py-1 text-[11px] font-medium text-teal-100 hover:bg-teal-600/20 disabled:opacity-40"
            >
              Send selected ({selectedEligible.length})
            </button>
            <span className="text-[10px] text-zinc-600">
              {eligibleRows.length} eligible · {rows.length - eligibleRows.length} already in outbox
            </span>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800/80">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-2 py-1.5">Candidate</th>
                  <th className="px-2 py-1.5">Signed</th>
                  <th className="px-2 py-1.5">Recruiter / DM</th>
                  <th className="px-2 py-1.5">DD status</th>
                  <th className="px-2 py-1.5">Outbox</th>
                  <th className="px-2 py-1.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rows.map((row) => {
                  const name = candidateNames[row.candidateId] ?? row.candidateId;
                  const alreadySent = row.outboxAlreadySent;
                  const disabled = !row.eligible || busyId !== null || bulkBusy;
                  return (
                    <tr key={row.candidateId} className="hover:bg-zinc-800/30">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${name}`}
                          disabled={!row.eligible || bulkBusy}
                          checked={selected.has(row.candidateId)}
                          onChange={() => toggleSelect(row.candidateId)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          className="font-medium text-zinc-100 hover:text-teal-200 hover:underline"
                          onClick={() => onOpenCandidate?.(row.candidateId)}
                        >
                          {name}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-zinc-400">
                        {formatSignedAt(row.paperworkSignedAt)}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-500">
                        {row.assignedRecruiter} · {row.assignedDM}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-400">
                        {directDepositStatusLabel(row.directDepositStatus)}
                      </td>
                      <td className="px-2 py-1.5">
                        {alreadySent ? (
                          <span className="text-amber-200/90" title={row.outboxSentAt ?? undefined}>
                            Already sent
                          </span>
                        ) : (
                          <span className="text-zinc-600">Not logged</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void sendOne(row)}
                          className="rounded border border-teal-600/40 px-1.5 py-0.5 text-[10px] font-medium text-teal-100 hover:bg-teal-600/15 disabled:opacity-40"
                        >
                          {busyId === row.candidateId
                            ? "Sending…"
                            : alreadySent
                              ? "Already sent"
                              : "Send DD email"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmBulkOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md rounded-xl border border-zinc-700 bg-zinc-950 p-4 shadow-xl">
            <p className="text-sm font-medium text-zinc-100">Confirm bulk send</p>
            <p className="mt-2 text-xs text-zinc-400">
              You are about to send {selectedEligible.length} direct deposit verification email
              {selectedEligible.length === 1 ? "" : "s"}. This cannot be undone automatically.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBulkOpen(false)}
                className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void sendBulkConfirmed()}
                className="rounded-md border border-teal-600/50 bg-teal-600/15 px-3 py-1 text-xs font-medium text-teal-100"
              >
                Send {selectedEligible.length} email{selectedEligible.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
