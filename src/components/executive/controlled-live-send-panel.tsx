"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { ControlledLiveSendReport } from "@/lib/controlled-live-send/types";
import { P100_CONFIRMATION_PHRASE } from "@/lib/controlled-live-send/types";
import { useCallback, useEffect, useState } from "react";

export function ControlledLiveSendPanel() {
  const [report, setReport] = useState<ControlledLiveSendReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/controlled-live-send?includeCandidates=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        controlledLiveSend?: ControlledLiveSendReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.controlledLiveSend) {
        setError(data.error ?? "Failed to load controlled live send");
        return;
      }
      setReport(data.controlledLiveSend);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load controlled live send");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runMode = async (mode: "dryRun" | "executeOne" | "executeBatch") => {
    if (!report) return;
    setRunning(true);
    setActionError(null);
    setActionResult(null);
    try {
      const body: Record<string, unknown> = { mode, mtdOnly: true };
      if (mode !== "dryRun") {
        body.executiveApprovalFlag = true;
      }
      if (mode === "executeBatch") {
        body.confirmationPhrase = phrase;
        body.candidateCount = report.expectedCandidateCount;
      }
      const res = await fetch("/api/controlled-live-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        controlledLiveSend?: ControlledLiveSendReport;
        warnings?: string[];
        error?: string;
        executed?: Array<{ outcome: string }>;
      };
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? "Controlled live send failed");
        return;
      }
      if (data.controlledLiveSend) setReport(data.controlledLiveSend);
      setWarnings(data.warnings ?? []);
      const sent = data.executed?.filter((e) => e.outcome === "sent").length ?? 0;
      const simulated = data.executed?.filter((e) => e.outcome === "simulated").length ?? 0;
      setActionResult(
        mode === "dryRun"
          ? `dryRun complete — ${simulated} simulated, 0 sent.`
          : `${mode} complete — ${sent} sent.`,
      );
    } catch {
      setActionError("Controlled live send failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading && !report) {
    return <ExecutivePanelLoading title="Controlled Live Send" badge="P100" />;
  }

  if (error) {
    return (
      <ExecutivePanelError title="Controlled Live Send" message={error} onRetry={() => void load()} />
    );
  }

  if (!report) return null;

  const m = report.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title={report.sectionTitle}
        subtitle={`${report.cohortLabel}. Default mode: dryRun — no auto-send.`}
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Ready to send" value={m.readyToSend.toLocaleString()} />
        <MetricCard label="Sent" value={m.sent.toLocaleString()} />
        <MetricCard label="Skipped" value={m.skipped.toLocaleString()} />
        <MetricCard label="Failed / blocked" value={m.failed.toLocaleString()} />
        <MetricCard label="Remaining" value={m.remaining.toLocaleString()} />
        <MetricCard label="liveSend" value={report.liveSend ? "enabled" : "disabled"} />
        <MetricCard label="Go / No-Go" value={report.goNoGo.toUpperCase()} />
      </div>
      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300">Safety locks</h3>
        <ul className="mt-2 space-y-1 text-sm text-zinc-400">
          {report.safetyLocks.map((lock) => (
            <li key={lock.id}>
              <span className={lock.satisfied ? "text-emerald-400" : "text-amber-300"}>
                {lock.satisfied ? "✓" : "○"}
              </span>{" "}
              {lock.label} — {lock.detail}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => void runMode("dryRun")}
          className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Run dryRun
        </button>
        <button
          type="button"
          disabled={running || !report.liveSend || !report.readinessApproved}
          onClick={() => void runMode("executeOne")}
          className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          executeOne
        </button>
      </div>
      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-medium text-zinc-200">executeBatch (live)</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Requires liveSend enabled, P99 approval, and phrase &quot;{P100_CONFIRMATION_PHRASE}&quot;
        </p>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={P100_CONFIRMATION_PHRASE}
          className="mt-3 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <button
          type="button"
          disabled={
            running ||
            !report.liveSend ||
            !report.readinessApproved ||
            phrase.trim() !== P100_CONFIRMATION_PHRASE
          }
          onClick={() => void runMode("executeBatch")}
          className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          executeBatch
        </button>
      </div>
      {actionError ? <p className="mt-3 text-sm text-red-400">{actionError}</p> : null}
      {actionResult ? <p className="mt-3 text-sm text-emerald-400">{actionResult}</p> : null}
      <p className="mt-4 text-xs text-zinc-500">{report.goNoGoReason}</p>
    </ExecutiveCard>
  );
}
