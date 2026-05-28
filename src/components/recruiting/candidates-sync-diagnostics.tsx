"use client";

import { useEffect, useState } from "react";
import {
  getBreezySyncMetricsSnapshot,
  subscribeBreezySyncMetrics,
  type BreezySyncMetricsSnapshot,
} from "@/lib/breezy-sync-metrics";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[11px] leading-snug">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-300">{value}</span>
    </div>
  );
}

function snapshotRows(snapshot: BreezySyncMetricsSnapshot) {
  const phases = snapshot.completedPhases.length
    ? snapshot.completedPhases.join(", ")
    : "—";
  return (
    <div className="mt-2 space-y-1 border-t border-zinc-800/60 pt-2">
      <Row label="Last sync duration" value={formatMs(snapshot.totalDurationMs)} />
      <Row label="Candidate count" value={snapshot.candidateCount?.toLocaleString() ?? "—"} />
      <Row label="Cache restored" value={snapshot.cacheRestored ? "yes" : "no"} />
      <Row label="Live sync running" value={snapshot.liveSyncRunning ? "yes" : "no"} />
      <Row label="Last successful sync" value={formatTimestamp(snapshot.lastSuccessfulSyncAt)} />
      <Row label="Last timeout phase" value={snapshot.lastTimeoutPhase ?? "—"} />
      <Row label="API phases completed" value={phases} />
      <Row label="API requests" value={String(snapshot.apiRequestCount)} />
      <Row label="Timeouts" value={String(snapshot.timeoutCount)} />
      <Row label="Cache hits / live hits" value={`${snapshot.cacheHitCount} / ${snapshot.liveHitCount}`} />
      <Row label="Preview duration" value={formatMs(snapshot.phases.preview.durationMs)} />
      <Row label="Fast-tier duration" value={formatMs(snapshot.phases["fast-tier"].durationMs)} />
      <Row label="Workflows duration" value={formatMs(snapshot.phases.workflows.durationMs)} />
      <Row
        label="Hydration duration"
        value={formatMs(snapshot.phases["hydration-continuation"].durationMs)}
      />
      <Row label="Watchdog" value={snapshot.watchdogLevel} />
    </div>
  );
}

export function CandidatesSyncDiagnosticsPanel() {
  const [snapshot, setSnapshot] = useState(() => getBreezySyncMetricsSnapshot());

  useEffect(() => subscribeBreezySyncMetrics(() => setSnapshot(getBreezySyncMetricsSnapshot())), []);

  return (
    <details className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 text-zinc-400">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-zinc-500 marker:content-none [&::-webkit-details-marker]:hidden">
        Sync diagnostics (developer)
      </summary>
      <div className="border-t border-zinc-800/60 px-3 pb-3">{snapshotRows(snapshot)}</div>
    </details>
  );
}
