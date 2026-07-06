"use client";

import { ExecutiveCard, ExecutiveButton, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useProductionOperations } from "@/hooks/use-production-operations";
import { useState } from "react";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

export function ProductionOperationsDashboardPanel() {
  const { snapshot, readiness, observability, loading, refreshing, error, searchQuery, refresh, searchHistory } =
    useProductionOperations();
  const [query, setQuery] = useState("");

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Production operations"
        subtitle="P149 production readiness — live activation dashboard, disabled by default."
        actions={
          <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </ExecutiveButton>
        }
      />

      {readiness ? (
        <p
          className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
            readiness.finalRecommendation === "GO LIVE"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
              : readiness.finalRecommendation === "GO LIVE WITH CONDITIONS"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          Readiness: {readiness.finalRecommendation} ({readiness.productionReadinessScore}/100) — all automation
          flags off by default.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

      {snapshot?.alerts && snapshot.alerts.length > 0 ? (
        <div className="mt-3 space-y-1">
          {snapshot.alerts.map((alert) => (
            <p
              key={alert.id}
              className={`rounded px-3 py-1.5 text-xs ${
                alert.severity === "critical"
                  ? "border border-red-500/30 bg-red-500/10 text-red-200"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-100"
              }`}
            >
              {alert.message}: {alert.detail}
            </p>
          ))}
        </div>
      ) : null}

      {loading && !snapshot ? (
        <p className="mt-4 text-sm text-zinc-500">Loading production operations…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Automation status" value={snapshot?.automationStatus ?? "—"} />
          <MetricCard label="Last run" value={formatTimestamp(snapshot?.lastRun)} />
          <MetricCard label="Next run" value={formatTimestamp(snapshot?.nextRun)} />
          <MetricCard label="Success rate" value={`${snapshot?.automationSuccessPercent ?? 0}%`} />
          <MetricCard label="Candidates today" value={snapshot?.candidatesProcessedToday ?? 0} />
          <MetricCard label="Paperwork sent today" value={snapshot?.paperworkSentToday ?? 0} />
          <MetricCard label="Reminder #1" value={snapshot?.reminder1Today ?? 0} />
          <MetricCard label="Reminder #2" value={snapshot?.reminder2Today ?? 0} />
          <MetricCard label="Blocked" value={snapshot?.blockedCandidates ?? 0} />
          <MetricCard label="Failures" value={snapshot?.failures.length ?? 0} />
          <MetricCard label="Warnings" value={snapshot?.warnings.length ?? 0} />
          <MetricCard
            label="Avg turnaround"
            value={`${snapshot?.averagePaperworkTurnaroundHours ?? 0}h`}
          />
          <MetricCard
            label="Recruiter hrs saved"
            value={`${snapshot?.estimatedRecruiterHoursSaved ?? 0}h`}
          />
          <MetricCard
            label="Orchestrator"
            value={snapshot?.orchestratorEnabled ? "Enabled" : "Disabled"}
          />
        </div>
      )}

      <div className="mt-6">
        <SectionHeader title="Observability history" subtitle="Search sends, reminders, failures, and skipped candidates." />
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            placeholder="Search audit history…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchHistory(query);
            }}
          />
          <ExecutiveButton onClick={() => searchHistory(query)}>Search</ExecutiveButton>
        </div>
        {searchQuery ? (
          <p className="mt-1 text-xs text-zinc-500">Showing results for: {searchQuery}</p>
        ) : null}
        <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-zinc-800">
          {observability.length === 0 ? (
            <p className="p-3 text-xs text-zinc-500">No observability entries yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 text-xs text-zinc-400">
              {observability.map((entry) => (
                <li key={entry.id} className="px-3 py-2">
                  <span className="text-zinc-300">{formatTimestamp(entry.at)}</span> · {entry.source} ·{" "}
                  {entry.type}
                  {entry.candidateId ? ` · ${entry.candidateId}` : ""}
                  {entry.duplicatePrevented ? " · duplicate prevented" : ""}
                  <br />
                  {entry.summary}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ExecutiveCard>
  );
}
