"use client";

import {
  analyzeBreezyCandidatesHealth,
  analyzeBreezyJobsHealth,
  analyzeMelProjectsHealth,
  analyzeRecruitingSheetHealth,
  type DataHealthReport,
} from "@/lib/data-health";
import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import type { SheetDataResult } from "@/lib/google-sheet-csv";
import { useCallback, useEffect, useState } from "react";
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

type EndpointCardProps = {
  report: DataHealthReport;
};

function EndpointHealthCard({ report }: EndpointCardProps) {
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

        {report.metaLine ? (
          <p className="text-xs text-zinc-500">{report.metaLine}</p>
        ) : null}
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

function DataHealthSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="h-64 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40"
        />
      ))}
    </div>
  );
}

function HealthReportGrid({ reports }: { reports: DataHealthReport[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-2">
      {reports.map((report) => (
        <EndpointHealthCard key={report.id} report={report} />
      ))}
    </div>
  );
}

export function DataHealthSection() {
  const [reports, setReports] = useState<DataHealthReport[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      const [recruitingRes, melRes, breezyJobsRes, breezyCandidatesRes] = await Promise.all([
        fetch("/api/recruiting-sheet", { cache: "no-store" }),
        fetch("/api/mel-projects", { cache: "no-store" }),
        fetch("/api/breezy/jobs", { cache: "no-store" }),
        fetch("/api/breezy/candidates", { cache: "no-store" }),
      ]);

      const failures: string[] = [];
      let recruitingJson: SheetDataResult | null = null;
      let melJson: SheetDataResult | null = null;
      let breezyJobsJson: BreezyJobsResult | null = null;
      let breezyCandidatesJson: BreezyCandidatesResult | null = null;

      if (!recruitingRes.ok) {
        failures.push(`Recruiting sheet HTTP ${recruitingRes.status}`);
      } else {
        recruitingJson = (await recruitingRes.json()) as SheetDataResult;
      }

      if (!melRes.ok) {
        failures.push(`MEL projects HTTP ${melRes.status}`);
      } else {
        melJson = (await melRes.json()) as SheetDataResult;
      }

      breezyJobsJson = (await breezyJobsRes.json()) as BreezyJobsResult;
      if (!breezyJobsRes.ok) {
        const safeMissingToken = !breezyJobsJson.ok && breezyJobsJson.error.includes("BREEZY_API_KEY");
        if (!safeMissingToken) failures.push(`Breezy jobs HTTP ${breezyJobsRes.status}`);
      }

      breezyCandidatesJson = (await breezyCandidatesRes.json()) as BreezyCandidatesResult;
      if (!breezyCandidatesRes.ok) {
        const safeMissingToken =
          !breezyCandidatesJson.ok && breezyCandidatesJson.error.includes("BREEZY_API_KEY");
        if (!safeMissingToken) failures.push(`Breezy candidates HTTP ${breezyCandidatesRes.status}`);
      }

      const nextReports: DataHealthReport[] = [];

      if (recruitingJson) {
        nextReports.push(analyzeRecruitingSheetHealth(recruitingJson));
      } else {
        nextReports.push(
          analyzeRecruitingSheetHealth({
            ok: false,
            error: failures.find((f) => f.startsWith("Recruiting")) ?? "Request failed",
            fetchedAt: new Date().toISOString(),
            csvUrl: "",
          }),
        );
      }

      if (melJson) {
        nextReports.push(analyzeMelProjectsHealth(melJson));
      } else {
        nextReports.push(
          analyzeMelProjectsHealth({
            ok: false,
            error: failures.find((f) => f.startsWith("MEL")) ?? "Request failed",
            fetchedAt: new Date().toISOString(),
            csvUrl: "",
          }),
        );
      }

      nextReports.push(
        analyzeBreezyJobsHealth(
          breezyJobsJson ?? {
            ok: false,
            error: "Request failed",
            fetchedAt: new Date().toISOString(),
          },
        ),
      );

      nextReports.push(
        analyzeBreezyCandidatesHealth(
          breezyCandidatesJson ?? {
            ok: false,
            error: "Request failed",
            fetchedAt: new Date().toISOString(),
          },
        ),
      );

      if (failures.length > 0) {
        setLoadError(failures.join("; "));
      }

      setReports(nextReports);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load data health";
      setLoadError(message);
      setReports(undefined);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Data health</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Live checks against Google Sheet CSV exports and read-only Breezy HR endpoints. Warnings
            appear when APIs fail, data is empty, or required fields are missing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </section>

      {loadError ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {loadError}
        </div>
      ) : null}

      {reports === undefined ? (
        <DataHealthSkeleton />
      ) : (
        <div className="space-y-8">
          <BreezySyncHealthSection />

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Google Sheets
            </h2>
            <HealthReportGrid reports={reports.filter((report) => report.source === "sheet")} />
          </section>
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Breezy HR (read-only)
            </h2>
            <HealthReportGrid reports={reports.filter((report) => report.source === "breezy")} />
          </section>
        </div>
      )}
    </div>
  );
}
