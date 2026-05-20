"use client";

import {
  analyzeBreezyCandidatesHealth,
  analyzeBreezyJobsHealth,
  analyzeMelProjectsHealth,
  analyzeRecruitingSheetHealth,
  type DataHealthEndpointId,
  type DataHealthReport,
} from "@/lib/data-health";
import {
  DataHealthRequestTimeoutError,
  fetchJsonWithTimeout,
  logDataHealthTiming,
} from "@/lib/data-health-fetch";
import { fetchMelProjectsData, fetchRecruitingSheetData } from "@/lib/dashboard-api-client";
import type { BreezyCandidatesHealthProbe, BreezyJobsResult } from "@/lib/breezy-api";
import { useCallback, useEffect, useRef, useState } from "react";
import { BreezyParityDiagnostics } from "./breezy-parity-diagnostics";
import { BreezySyncHealthSection } from "./breezy-sync-health-section";

function formatFetchedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

type CardLoadState = {
  loading: boolean;
  error: string | null;
  report: DataHealthReport | null;
};

const ENDPOINT_ORDER: DataHealthEndpointId[] = [
  "recruiting-sheet",
  "mel-projects",
  "breezy-jobs",
  "breezy-candidates",
];

function initialCardState(): Record<DataHealthEndpointId, CardLoadState> {
  return {
    "recruiting-sheet": { loading: true, error: null, report: null },
    "mel-projects": { loading: true, error: null, report: null },
    "breezy-jobs": { loading: true, error: null, report: null },
    "breezy-candidates": { loading: true, error: null, report: null },
  };
}

type EndpointCardProps = {
  report: DataHealthReport | null;
  loading: boolean;
  error: string | null;
};

function EndpointHealthCard({ report, loading, error }: EndpointCardProps) {
  if (loading && !report) {
    return (
      <article
        className="flex h-64 flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
        aria-busy="true"
      >
        <div className="animate-pulse space-y-4 px-5 py-5">
          <div className="h-6 w-40 rounded bg-zinc-800/80" />
          <div className="h-4 w-56 rounded bg-zinc-800/60" />
          <div className="grid grid-cols-2 gap-3 pt-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 rounded bg-zinc-800/50" />
            ))}
          </div>
        </div>
      </article>
    );
  }

  if (!report) {
    return (
      <article className="flex flex-col rounded-2xl border border-rose-500/30 bg-rose-500/5 px-5 py-5">
        <h2 className="text-lg font-semibold text-zinc-50">Endpoint unavailable</h2>
        <p role="alert" className="mt-2 text-sm text-rose-100">
          {error ?? "Failed to load health data."}
        </p>
      </article>
    );
  }

  const isConnected = report.status === "connected";
  const isBreezy = report.source === "breezy";
  const countLabel = isBreezy ? "Record count" : "Row count";
  const fieldsLabel = isBreezy ? "Fields (first record)" : "Columns";
  const namesLabel = isBreezy ? "First 5 field names" : "First 5 column names";
  const sampleLabel = isBreezy ? "Sample first record" : "Sample first row";

  return (
    <article
      className="flex flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
      aria-labelledby={`${report.id}-heading`}
    >
      <header className="flex flex-col gap-3 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
        <div>
          <h2
            id={`${report.id}-heading`}
            className="text-lg font-semibold tracking-tight text-zinc-50"
          >
            {report.label}
          </h2>
          <p className="mt-1 font-mono text-xs text-zinc-500">{report.apiPath}</p>
        </div>
        <span
          className={[
            "inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium",
            isConnected
              ? "border-teal-500/30 bg-teal-500/10 text-teal-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200",
          ].join(" ")}
        >
          Status: {isConnected ? "Connected" : "Error"}
        </span>
      </header>

      {error ? (
        <p
          role="status"
          className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 sm:mx-5"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5 sm:py-5 lg:grid-cols-4">
        <Metric label={countLabel} value={formatCount(report.rowCount)} warn={report.rowCount === 0} />
        <Metric label={fieldsLabel} value={formatCount(report.columnCount)} />
        <Metric
          label="Last refreshed"
          value={report.fetchedAt ? formatFetchedAt(report.fetchedAt) : "—"}
          className="sm:col-span-2 lg:col-span-2"
        />
      </div>

      {report.warnings.length > 0 ? (
        <div
          role="alert"
          className="mx-4 mb-0 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:mx-5"
        >
          <p className="font-medium text-amber-50">Warnings</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-amber-100/90">
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-4 border-t border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{namesLabel}</h3>
          {report.firstFiveColumns.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {report.firstFiveColumns.map((col) => (
                <li
                  key={col}
                  className="rounded-md border border-zinc-700/80 bg-zinc-950/60 px-2 py-1 font-mono text-xs text-zinc-300"
                >
                  {col}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No columns available.</p>
          )}
        </div>

        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{sampleLabel}</h3>
          {report.sampleRowPreview.length > 0 ? (
            <div className="mt-2 divide-y divide-zinc-800/80 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
              {report.sampleRowPreview.map(({ column, value }) => (
                <div
                  key={column}
                  className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4"
                >
                  <span className="shrink-0 font-medium text-zinc-500">{column}</span>
                  <span className="min-w-0 break-words text-zinc-200">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No row data to preview.</p>
          )}
        </div>

        {report.metaLine ? <p className="text-xs text-zinc-500">{report.metaLine}</p> : null}
        {report.csvUrl ? (
          <p className="break-all font-mono text-xs text-zinc-600">{report.csvUrl}</p>
        ) : null}
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  warn,
  className = "",
}: {
  label: string;
  value: string;
  warn?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={[
          "mt-1 text-xl font-semibold tabular-nums tracking-tight",
          warn ? "text-amber-300" : "text-zinc-50",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function HealthReportGrid({
  reports,
  cards,
}: {
  reports: DataHealthEndpointId[];
  cards: Record<DataHealthEndpointId, CardLoadState>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-2">
      {reports.map((id) => (
        <EndpointHealthCard
          key={id}
          report={cards[id]?.report ?? null}
          loading={cards[id]?.loading ?? false}
          error={cards[id]?.error ?? null}
        />
      ))}
    </div>
  );
}

export function DataHealthSection() {
  const [cards, setCards] = useState(initialCardState);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const loadGeneration = useRef(0);

  const setCard = useCallback((id: DataHealthEndpointId, patch: Partial<CardLoadState>) => {
    setCards((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }, []);

  const loadEndpoint = useCallback(
    async (id: DataHealthEndpointId, generation: number): Promise<void> => {
      setCard(id, { loading: true, error: null });

      try {
        if (id === "recruiting-sheet") {
          const data = await fetchRecruitingSheetData();
          if (generation !== loadGeneration.current) return;
          setCard(id, {
            loading: false,
            error: null,
            report: analyzeRecruitingSheetHealth(data),
          });
          return;
        }

        if (id === "mel-projects") {
          const data = await fetchMelProjectsData();
          if (generation !== loadGeneration.current) return;
          setCard(id, {
            loading: false,
            error: null,
            report: analyzeMelProjectsHealth(data),
          });
          return;
        }

        if (id === "breezy-jobs") {
          const data = await fetchJsonWithTimeout<BreezyJobsResult>("/api/breezy/jobs", {
            label: "breezy-jobs",
          });
          if (generation !== loadGeneration.current) return;
          const report = analyzeBreezyJobsHealth(data);
          setCard(id, {
            loading: false,
            error: data.ok ? null : data.error,
            report,
          });
          return;
        }

        const data = await fetchJsonWithTimeout<BreezyCandidatesHealthProbe>(
          "/api/breezy/candidates/health",
          { label: "breezy-candidates-health" },
        );
        if (generation !== loadGeneration.current) return;
        const report = analyzeBreezyCandidatesHealth(data);
        setCard(id, {
          loading: false,
          error: data.ok ? null : data.error,
          report,
        });
      } catch (err) {
        if (generation !== loadGeneration.current) return;
        const message =
          err instanceof DataHealthRequestTimeoutError
            ? `${err.message} — showing partial card state.`
            : err instanceof Error
              ? err.message
              : "Request failed";

        if (id === "recruiting-sheet") {
          setCard(id, {
            loading: false,
            error: message,
            report: analyzeRecruitingSheetHealth({
              ok: false,
              error: message,
              fetchedAt: new Date().toISOString(),
              csvUrl: "",
            }),
          });
          return;
        }

        if (id === "mel-projects") {
          setCard(id, {
            loading: false,
            error: message,
            report: analyzeMelProjectsHealth({
              ok: false,
              error: message,
              fetchedAt: new Date().toISOString(),
              csvUrl: "",
            }),
          });
          return;
        }

        if (id === "breezy-jobs") {
          setCard(id, {
            loading: false,
            error: message,
            report: analyzeBreezyJobsHealth({
              ok: false,
              error: message,
              fetchedAt: new Date().toISOString(),
            }),
          });
          return;
        }

        setCard(id, {
          loading: false,
          error: message,
          report: analyzeBreezyCandidatesHealth({
            ok: false,
            error: message,
            fetchedAt: new Date().toISOString(),
          }),
        });
      }
    },
    [setCard],
  );

  const runLoad = useCallback(
    async (force = false) => {
      const generation = loadGeneration.current + 1;
      loadGeneration.current = generation;
      const started = performance.now();

      if (force) {
        const { invalidateCached } = await import("@/lib/client-api-cache");
        invalidateCached("recruiting-sheet");
        invalidateCached("mel-projects");
      }

      const results = await Promise.allSettled(
        ENDPOINT_ORDER.map((id) => loadEndpoint(id, generation)),
      );

      const rejected = results.filter((r) => r.status === "rejected");
      if (rejected.length > 0) {
        console.warn("[data-health] endpoint failures", rejected);
      }

      logDataHealthTiming("data-health-load-ms", performance.now() - started, "all-endpoints");
    },
    [loadEndpoint],
  );

  useEffect(() => {
    void runLoad(false);
  }, [runLoad]);

  const connectedReports = ENDPOINT_ORDER.map((id) => cards[id]?.report).filter(
    (report): report is DataHealthReport =>
      Boolean(report && report.status === "connected" && report.fetchedAt),
  );
  const lastSuccessfulRefresh =
    connectedReports.length > 0
      ? connectedReports
          .map((report) => report.fetchedAt)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
      : null;

  const sheetIds = ENDPOINT_ORDER.filter((id) => id === "recruiting-sheet" || id === "mel-projects");
  const breezyIds = ENDPOINT_ORDER.filter((id) => id === "breezy-jobs" || id === "breezy-candidates");

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Data health</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Lightweight live checks load per endpoint (15s client limit). Full Breezy parity runs only
            when you click Run parity check below.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setManualRefreshing(true);
            void runLoad(true).finally(() => setManualRefreshing(false));
          }}
          disabled={manualRefreshing}
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {manualRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </section>

      {lastSuccessfulRefresh ? (
        <section className="rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-sm text-teal-100">
          Last successful refresh: {formatFetchedAt(lastSuccessfulRefresh)}
        </section>
      ) : null}

      <BreezySyncHealthSection />

      <BreezyParityDiagnostics />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Google Sheets</h2>
        <HealthReportGrid reports={sheetIds} cards={cards} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Breezy HR (read-only)</h2>
        <HealthReportGrid reports={breezyIds} cards={cards} />
      </section>
    </div>
  );
}
