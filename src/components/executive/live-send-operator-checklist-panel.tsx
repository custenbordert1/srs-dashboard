"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { LiveSendOperatorChecklistReport } from "@/lib/live-send-operator-checklist/types";
import { useCallback, useEffect, useState } from "react";

export function LiveSendOperatorChecklistPanel() {
  const [report, setReport] = useState<LiveSendOperatorChecklistReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/live-send-operator-checklist", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        checklist?: LiveSendOperatorChecklistReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.checklist) {
        setError(data.error ?? "Failed to load operator checklist");
        return;
      }
      setReport(data.checklist);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load operator checklist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !report) {
    return <ExecutivePanelLoading title="Live Send Operator Checklist" badge="P101" />;
  }

  if (error) {
    return (
      <ExecutivePanelError
        title="Live Send Operator Checklist"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!report) return null;

  const m = report.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title={report.sectionTitle}
        subtitle={`${report.cohortLabel}. Read-only guard — no sends from this panel.`}
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-4">
        <span
          className={`inline-block rounded-md px-3 py-1 text-sm font-semibold ${
            report.goNoGo === "GO"
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-red-500/20 text-red-300"
          }`}
        >
          {report.goNoGo}
        </span>
        <p className="mt-2 text-sm text-zinc-400">{report.goNoGoReason}</p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="P97 persisted" value={m.p97PersistedCount.toLocaleString()} />
        <MetricCard label="P100 ready" value={m.p100ReadyToSend.toLocaleString()} />
        <MetricCard label="Duplicate risk" value={m.duplicateRiskCount.toLocaleString()} />
        <MetricCard label="Invalid email" value={m.invalidEmailCount.toLocaleString()} />
        <MetricCard label="Already sent" value={m.p100AlreadySent.toLocaleString()} />
        <MetricCard label="liveSend" value={m.liveSend ? "on" : "off"} />
      </div>
      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300">Checklist</h3>
        <ul className="mt-2 space-y-1 text-sm text-zinc-400">
          {report.checklist.map((entry) => (
            <li key={entry.id}>
              <span className={entry.satisfied ? "text-emerald-400" : "text-amber-300"}>
                {entry.satisfied ? "✓" : "○"}
              </span>{" "}
              {entry.label} — {entry.detail}
            </li>
          ))}
        </ul>
      </div>
      {report.remainingActionsBeforeExecuteOne.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-300">Remaining actions before executeOne</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">
            {report.remainingActionsBeforeExecuteOne.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-zinc-300">Recommended first live send</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
          {report.recommendedFirstLiveSendApproach.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </ExecutiveCard>
  );
}
