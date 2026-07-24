"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/executive/ui";
import { useCallback, useEffect, useRef, useState } from "react";

type StageMetrics = {
  stage: string;
  count: number;
  trend: number;
  lastUpdate: string | null;
  changeToday: number;
  largestBlocker: string | null;
  secondBlocker: string | null;
  estimatedHoursToClear: number | null;
};

type Subsystem = {
  id: string;
  label: string;
  score: number;
  tone: string;
  detail: string;
};

type Dropbox = {
  productionQuota: number | null;
  testMode: boolean | null;
  apiStatus: string;
  lastSuccessfulSendAt: string | null;
  lastFailedSendAt: string | null;
  templatesAvailable: number | null;
  accountEmail: string | null;
  configurationStatus: string;
  softwareReady: boolean;
  vendorBlocked: boolean;
  detail: string;
  recoveryState?: string;
  quotaRestoredRecommendP206?: boolean;
};

type FunnelStep = {
  id: string;
  label: string;
  count: number;
  percentOfApplied: number;
  percentOfPrevious: number | null;
};

type Card = {
  id: string;
  title: string;
  count: number;
  tone: string;
  detail: string;
  drillKey?: string | null;
};

type Forecast = {
  ifDropboxRestoredNow: {
    expectedSends: number;
    expectedSignatures: number;
    expectedReadyForMel: number;
  };
  next24h: {
    expectedSends: number;
    expectedSignatures: number;
    expectedReadyForMel: number;
  };
  next7d: {
    expectedSends: number;
    expectedSignatures: number;
    expectedReadyForMel: number;
  };
  assumptions?: string[];
};

type DrillRow = {
  candidateId: string;
  displayName: string;
  stage: string;
  blocker: string;
  reasonCodes: string[];
  confidence: number | null;
  assignedRecruiter: string;
  owner?: string;
  aiRecommendation: string | null;
  nextAction: string;
  nearestWork?: string | null;
  lastActivityAt?: string | null;
};

type Alert = {
  id: string;
  severity: string;
  title: string;
  explanation: string;
  affectedCount: number;
  subsystem: string;
  firstObservedAt: string;
  lastObservedAt: string;
  recommendedAction: string;
  supportingMetric: string;
  resolved: boolean;
  drillKey: string | null;
};

type Freshness = {
  generatedAt: string;
  observedAt: string;
  ageMs: number;
  state: "Live" | "Delayed" | "Stale";
};

type Snapshot = {
  generatedAt: string;
  freshness?: Freshness;
  stages: StageMetrics[];
  subsystemScores: Subsystem[];
  overallScore: number;
  overallTone: string;
  dropbox: Dropbox;
  funnel: FunnelStep[];
  executiveCards: Card[];
  forecast: Forecast;
  alerts?: Alert[];
  activeAlertCount?: number;
  largestBlocker: string;
  immediateSendReady: number;
  autonomousReadiness: string;
  validation?: {
    matched: boolean;
    countMismatches: Array<{ stage: string; authoritative: number; dashboard: number }>;
    refreshLatencyMs: number;
    missingData: string[];
  };
  safety?: Record<string, boolean>;
};

type Payload = {
  ok?: boolean;
  message?: string;
  generatedAt?: string;
  snapshot?: Snapshot;
};

function fmt(v: string | number | null | undefined): string {
  if (v == null) return "—";
  return String(v);
}

function healthTone(tone: string): StatusBadgeTone {
  if (tone === "healthy" || tone === "informational") return "success";
  if (tone === "warning") return "warning";
  if (tone === "critical") return "critical";
  return "neutral";
}

function freshnessTone(state: string): StatusBadgeTone {
  if (state === "Live") return "success";
  if (state === "Delayed") return "warning";
  return "critical";
}

export function P207AutonomousReadinessPanel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDrill, setActiveDrill] = useState<string | null>(null);
  const [rows, setRows] = useState<DrillRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const t0 = performance.now();
    setLoading(true);
    try {
      const res = await fetch("/api/recruiting/p207-autonomous-readiness", {
        cache: "no-store",
      });
      const json = (await res.json()) as Payload;
      if (!res.ok || !json.ok) {
        throw new Error(json.message || `HTTP ${res.status}`);
      }
      setData(json);
      setError(null);
      setRenderMs(Math.round(performance.now() - t0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load P207");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Single poller only — no duplicate polling.
    pollRef.current = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const openDrill = useCallback(async (key: string) => {
    setActiveDrill(key);
    setRowsLoading(true);
    try {
      const res = await fetch(
        `/api/recruiting/p207-autonomous-readiness?drill=${encodeURIComponent(key)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { rows?: DrillRow[]; generatedAt?: string };
      setRows(json.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, []);

  if (loading && !data) {
    return <SectionLoadingCard title="P207 Autonomous Readiness" badge="P207.1" />;
  }

  if (error || !data?.snapshot) {
    return (
      <ExecutiveCard>
        <SectionDegradedBanner message={error ?? "Readiness dashboard unavailable"} />
      </ExecutiveCard>
    );
  }

  const snap = data.snapshot;
  const payloadGeneratedAt = data.generatedAt ?? snap.generatedAt;
  const freshness = snap.freshness;
  const timestampParity = payloadGeneratedAt === snap.generatedAt;

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          title="Autonomous Readiness Dashboard"
          subtitle={snap.autonomousReadiness}
          badge="P207.1"
        />
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="neutral">Read-only</StatusBadge>
          {freshness ? (
            <StatusBadge tone={freshnessTone(freshness.state)}>
              {`Data ${freshness.state}`}
            </StatusBadge>
          ) : null}
          <StatusBadge tone={healthTone(snap.overallTone)}>
            {`Health ${snap.overallScore}`}
          </StatusBadge>
          <LastUpdatedBadge at={payloadGeneratedAt} />
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        {data.message ??
          "Explains why candidates progress or stall. Alerts are in-dashboard only."}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        generatedAt {payloadGeneratedAt}
        {timestampParity ? " · API/UI timestamp parity OK" : " · timestamp mismatch"}
        {renderMs != null ? ` · refresh ${renderMs}ms` : ""}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Overall score" value={`${snap.overallScore}/100`} hint={snap.overallTone} />
        <MetricCard label="Immediate send-ready" value={snap.immediateSendReady} />
        <MetricCard label="Largest blocker" value={snap.largestBlocker} />
        <MetricCard
          label="Dropbox recovery"
          value={snap.dropbox.recoveryState ?? (snap.dropbox.vendorBlocked ? "Vendor Blocked" : "—")}
        />
      </div>

      {snap.alerts && snap.alerts.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Operational alerts ({snap.activeAlertCount ?? snap.alerts.filter((a) => !a.resolved).length} active)
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            In-dashboard only — no email, SMS, or Slack in this phase.
          </p>
          <ul className="mt-3 space-y-2">
            {snap.alerts
              .filter((a) => !a.resolved)
              .slice(0, 12)
              .map((a) => (
                <li
                  key={a.id}
                  className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={healthTone(a.severity)}>{a.severity}</StatusBadge>
                      <span className="text-sm font-medium text-zinc-100">{a.title}</span>
                    </div>
                    {a.drillKey ? (
                      <button
                        type="button"
                        className="text-xs text-teal-300 underline"
                        onClick={() => void openDrill(a.drillKey!)}
                      >
                        Drill-down
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{a.explanation}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Affected {a.affectedCount} · {a.subsystem} · {a.supportingMetric}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">Action: {a.recommendedAction}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    First {new Date(a.firstObservedAt).toLocaleString()} · Last{" "}
                    {new Date(a.lastObservedAt).toLocaleString()}
                  </p>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Pipeline stages
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {snap.stages.map((s) => (
          <button
            key={s.stage}
            type="button"
            onClick={() => void openDrill(s.stage)}
            className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-4 text-left transition hover:border-teal-500/30"
          >
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">{s.stage}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{s.count}</div>
            <div className="mt-1 text-xs text-zinc-500">
              Δ today {s.changeToday} · trend {s.trend >= 0 ? "+" : ""}
              {s.trend}
            </div>
            <div className="mt-2 text-xs text-zinc-300">
              {s.largestBlocker ?? "No blocker"}
              {s.secondBlocker ? ` · ${s.secondBlocker}` : ""}
            </div>
          </button>
        ))}
      </div>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Subsystem health
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {snap.subsystemScores.map((s) => (
          <div key={s.id} className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-200">{s.label}</span>
              <StatusBadge tone={healthTone(s.tone)}>{s.tone}</StatusBadge>
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{s.score}</div>
            <div className="mt-1 text-xs text-zinc-500">{s.detail}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Dropbox health
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Recovery: {snap.dropbox.recoveryState ?? "—"}
            {snap.dropbox.quotaRestoredRecommendP206
              ? " — recommend re-run P206 (no auto-send / no P192)"
              : ""}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Production quota</dt>
            <dd className="tabular-nums text-zinc-200">{fmt(snap.dropbox.productionQuota)}</dd>
            <dt className="text-zinc-500">Test mode</dt>
            <dd className="text-zinc-200">
              {fmt(snap.dropbox.testMode == null ? null : String(snap.dropbox.testMode))}
            </dd>
            <dt className="text-zinc-500">API status</dt>
            <dd className="text-zinc-200">{snap.dropbox.apiStatus}</dd>
            <dt className="text-zinc-500">Software ready</dt>
            <dd className="text-zinc-200">{snap.dropbox.softwareReady ? "Yes" : "No"}</dd>
            <dt className="text-zinc-500">Vendor blocked</dt>
            <dd className="text-zinc-200">{snap.dropbox.vendorBlocked ? "Yes" : "No"}</dd>
            <dt className="text-zinc-500">Account</dt>
            <dd className="truncate text-xs text-zinc-300">{fmt(snap.dropbox.accountEmail)}</dd>
          </dl>
          <p className="mt-3 text-xs text-zinc-500">{snap.dropbox.detail}</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Operational forecast
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Expected sends</dt>
            <dd className="tabular-nums text-zinc-200">
              {snap.forecast.ifDropboxRestoredNow.expectedSends}
            </dd>
            <dt className="text-zinc-500">Expected signatures</dt>
            <dd className="tabular-nums text-zinc-200">
              {snap.forecast.ifDropboxRestoredNow.expectedSignatures}
            </dd>
            <dt className="text-zinc-500">Expected Ready for MEL</dt>
            <dd className="tabular-nums text-zinc-200">
              {snap.forecast.ifDropboxRestoredNow.expectedReadyForMel}
            </dd>
          </dl>
          {snap.forecast.assumptions?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-zinc-500">
              {snap.forecast.assumptions.slice(0, 4).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Executive cards
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {snap.executiveCards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => (c.drillKey ? void openDrill(c.drillKey) : undefined)}
            className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-4 text-left transition hover:border-teal-500/30"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-200">{c.title}</span>
              <StatusBadge tone={healthTone(c.tone)}>{c.tone}</StatusBadge>
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{c.count}</div>
            <div className="mt-1 text-xs text-zinc-500">{c.detail}</div>
          </button>
        ))}
      </div>

      {activeDrill ? (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Drill-down: {activeDrill}
            </h3>
            <button
              type="button"
              className="text-xs text-zinc-500 underline"
              onClick={() => {
                setActiveDrill(null);
                setRows([]);
              }}
            >
              Close
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Read-only — no edits · IDs only (no emails)</p>
          {rowsLoading ? (
            <p className="mt-3 text-sm text-zinc-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No rows for this drill key.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-zinc-500">
                    <th className="py-2 pr-2">ID</th>
                    <th className="py-2 pr-2">Stage</th>
                    <th className="py-2 pr-2">Blocker</th>
                    <th className="py-2 pr-2">Owner</th>
                    <th className="py-2 pr-2">Conf</th>
                    <th className="py-2 pr-2">Nearest work</th>
                    <th className="py-2 pr-2">Last activity</th>
                    <th className="py-2">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r) => (
                    <tr key={r.candidateId} className="border-b border-white/5">
                      <td className="py-2 pr-2 font-mono text-xs text-zinc-300">
                        {r.candidateId.length > 12
                          ? `${r.candidateId.slice(0, 6)}…${r.candidateId.slice(-4)}`
                          : r.candidateId}
                      </td>
                      <td className="py-2 pr-2 text-zinc-300">{r.stage}</td>
                      <td className="py-2 pr-2 text-zinc-300">{r.blocker}</td>
                      <td className="py-2 pr-2 text-zinc-300">{r.owner ?? r.assignedRecruiter}</td>
                      <td className="py-2 pr-2 tabular-nums text-zinc-300">{fmt(r.confidence)}</td>
                      <td className="py-2 pr-2 text-xs text-zinc-400">{fmt(r.nearestWork)}</td>
                      <td className="py-2 pr-2 text-xs text-zinc-400">
                        {r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 text-xs text-zinc-400">{r.nextAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {snap.validation ? (
        <p className="mt-6 text-xs text-zinc-500">
          Validation {snap.validation.matched ? "matched" : "mismatched"} · latency{" "}
          {snap.validation.refreshLatencyMs}ms
          {" · safety: no lifecycle / Dropbox send / MEL / P206 auto-rerun"}
        </p>
      ) : null}
    </ExecutiveCard>
  );
}
