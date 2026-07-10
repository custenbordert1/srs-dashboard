"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { LiveSendReadinessReport } from "@/lib/live-send-readiness/types";
import { P99_CONFIRMATION_PHRASE } from "@/lib/live-send-readiness/types";
import { useCallback, useEffect, useState } from "react";

export function LiveSendReadinessPanel() {
  const [readiness, setReadiness] = useState<LiveSendReadinessReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/live-send-readiness?includeCandidates=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        readiness?: LiveSendReadinessReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.readiness) {
        setError(data.error ?? "Failed to load live send readiness");
        return;
      }
      setReadiness(data.readiness);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load live send readiness");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async () => {
    if (!readiness) return;
    setApproving(true);
    setApproveError(null);
    setApproveSuccess(null);
    try {
      const res = await fetch("/api/live-send-readiness/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationPhrase: phrase,
          candidateCount: readiness.metrics.readinessPassCount,
          dryRunReportTimestamp: readiness.dryRunReportTimestamp,
          executiveApprovalFlag: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        readiness?: LiveSendReadinessReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setApproveError(data.error ?? "Readiness approval failed");
        return;
      }
      if (data.readiness) setReadiness(data.readiness);
      setWarnings(data.warnings ?? []);
      setApproveSuccess("Readiness approved — liveSend not enabled, no paperwork sent.");
      setPhrase("");
    } catch {
      setApproveError("Readiness approval failed");
    } finally {
      setApproving(false);
    }
  };

  if (loading && !readiness) {
    return <ExecutivePanelLoading title="Live Send Readiness" badge="P99" />;
  }

  if (error) {
    return (
      <ExecutivePanelError title="Live Send Readiness" message={error} onRetry={() => void load()} />
    );
  }

  if (!readiness) return null;

  const m = readiness.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title={readiness.sectionTitle}
        subtitle={`${readiness.cohortLabel}. Readiness approval does not send paperwork.`}
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Readiness pass" value={m.readinessPassCount.toLocaleString()} />
        <MetricCard label="Readiness blocked" value={m.readinessBlockedCount.toLocaleString()} />
        <MetricCard label="Total candidates" value={m.totalCandidates.toLocaleString()} />
        <MetricCard
          label="Readiness approved"
          value={readiness.readinessApproved ? "Yes" : "No"}
        />
      </div>
      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300">Safety locks</h3>
        <ul className="mt-2 space-y-1 text-sm text-zinc-400">
          {readiness.safetyLocks.map((lock) => (
            <li key={lock.id}>
              <span className={lock.satisfied ? "text-emerald-400" : "text-amber-300"}>
                {lock.satisfied ? "✓" : "○"}
              </span>{" "}
              {lock.label} — {lock.detail}
            </li>
          ))}
        </ul>
      </div>
      {!readiness.readinessApproved && m.readinessPassCount > 0 && m.readinessBlockedCount === 0 ? (
        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-sm font-medium text-zinc-200">Executive readiness approval</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Type &quot;{P99_CONFIRMATION_PHRASE}&quot; and confirm {m.readinessPassCount} ready
            candidate(s). Report timestamp: {readiness.dryRunReportTimestamp}
          </p>
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={P99_CONFIRMATION_PHRASE}
            className="mt-3 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
          <button
            type="button"
            disabled={approving || phrase.trim() !== P99_CONFIRMATION_PHRASE}
            onClick={() => void handleApprove()}
            className="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {approving ? "Approving…" : "Approve readiness (no send)"}
          </button>
          {approveError ? <p className="mt-2 text-sm text-red-400">{approveError}</p> : null}
        </div>
      ) : null}
      {approveSuccess ? <p className="mt-4 text-sm text-emerald-400">{approveSuccess}</p> : null}
      <p className="mt-4 text-xs text-zinc-500">{readiness.finalStepBeforeLiveSend}</p>
    </ExecutiveCard>
  );
}
