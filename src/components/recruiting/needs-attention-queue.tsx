"use client";

import type { SheetDataResult, SheetRow } from "@/lib/google-sheet-csv";
import { parseApplicantCount, parseCreatedDate } from "@/lib/post-automation";
import { resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";
import { useEffect, useMemo, useState } from "react";

type NeedsAttentionRow = {
  manager: string;
  city: string;
  state: string;
  applicantCount: string;
  createdDate: string;
};

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function formatCreatedDisplay(raw: string): string {
  const v = raw.trim();
  if (!v) return "—";
  const d = parseCreatedDate(v);
  if (!d) return v;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
  } catch {
    return v;
  }
}

function NeedsAttentionSkeleton() {
  return (
    <section
      aria-labelledby="needs-attention-heading"
      aria-busy="true"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-2 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5">
        <div className="h-6 w-48 animate-pulse rounded bg-zinc-800/80" />
        <div className="h-7 w-24 animate-pulse rounded-full bg-zinc-800/70" />
      </div>
      <div className="space-y-3 px-4 py-6 sm:px-5">
        <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/40" />
      </div>
    </section>
  );
}

type NeedsAttentionQueueProps = {
  onManagerDrillDown?: (manager: string) => void;
};

export function NeedsAttentionQueue({ onManagerDrillDown }: NeedsAttentionQueueProps) {
  const [data, setData] = useState<SheetDataResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/recruiting-sheet", { cache: "no-store" });
        const parsed = (await res.json()) as SheetDataResult;
        if (!cancelled) setData(parsed);
      } catch (e) {
        if (!cancelled) {
          setData({
            ok: false,
            error: e instanceof Error ? e.message : "Network error while loading the sheet.",
            fetchedAt: new Date().toISOString(),
            csvUrl: "",
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const { flaggedRows, missingColumns } = useMemo(() => {
    if (!data?.ok || data.headers.length === 0) {
      return { flaggedRows: [] as NeedsAttentionRow[], missingColumns: [] as string[] };
    }

    const keys = resolveKpiSheetColumnKeys(data.headers);
    const missing: string[] = [];
    if (!keys.status) missing.push("Status");
    if (!keys.applicantCount) missing.push("Applicant Count");

    if (!keys.status || !keys.applicantCount) {
      return { flaggedRows: [] as NeedsAttentionRow[], missingColumns: missing };
    }

    const out: NeedsAttentionRow[] = [];

    for (const row of data.rows) {
      const statusRaw = cell(row, keys.status);
      if (!statusRaw.toLowerCase().includes("open")) continue;
      if (parseApplicantCount(cell(row, keys.applicantCount)) !== 0) continue;

      out.push({
        manager: cell(row, keys.manager) || "—",
        city: cell(row, keys.city) || "—",
        state: cell(row, keys.state) || "—",
        applicantCount: cell(row, keys.applicantCount) || "0",
        createdDate: formatCreatedDisplay(cell(row, keys.createdDate)),
      });
    }

    return { flaggedRows: out, missingColumns: missing };
  }, [data]);

  const displayedRows = useMemo(() => flaggedRows.slice(0, 15), [flaggedRows]);
  const totalFlagged = flaggedRows.length;

  if (data === undefined) {
    return <NeedsAttentionSkeleton />;
  }

  if (!data.ok) {
    return (
      <section
        aria-labelledby="needs-attention-heading"
        className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
      >
        <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
          <h2 id="needs-attention-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Needs attention
          </h2>
          <p className="mt-1 text-sm text-zinc-500">Open posts with zero applicants (live sheet).</p>
        </div>
        <div className="px-4 py-6 sm:px-5">
          <p className="text-sm text-zinc-500">{data.error}</p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="needs-attention-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-2 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
        <div>
          <h2 id="needs-attention-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Needs attention
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Status includes <span className="text-zinc-400">Open</span> and applicant count is{" "}
            <span className="text-zinc-400">0</span>. Showing up to 15 rows.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-rose-500/25 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200">
          {totalFlagged} flagged
        </span>
      </div>

      {missingColumns.length > 0 ? (
        <div className="border-b border-zinc-800/80 px-4 py-3 sm:px-5">
          <p className="text-xs text-amber-200/90">
            Missing columns: <span className="font-medium">{missingColumns.join(", ")}</span>. Add
            Status and Applicant Count headers to your sheet.
          </p>
        </div>
      ) : null}

      {totalFlagged === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 sm:px-5">
          No rows need attention right now.
        </p>
      ) : (
        <>
          <div className="px-4 pt-3 sm:px-5">
            <p className="text-sm tabular-nums text-zinc-400">
              Showing <span className="font-medium text-zinc-200">{displayedRows.length}</span>
              {totalFlagged > 15 ? (
                <span>
                  {" "}
                  of <span className="font-medium text-zinc-200">{totalFlagged}</span> flagged
                </span>
              ) : null}
            </p>
          </div>
          <div className="overflow-x-auto px-4 pb-4 sm:px-5">
            <table className="min-w-[640px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">Manager</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">City</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">State</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right sm:px-5">
                    Applicant Count
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {displayedRows.map((row, i) => (
                  <tr key={i} className="hover:bg-zinc-800/30">
                    <td className="max-w-[180px] whitespace-pre-wrap px-4 py-3 text-zinc-100 sm:px-5">
                      {onManagerDrillDown && row.manager !== "—" ? (
                        <button
                          type="button"
                          onClick={() => onManagerDrillDown(row.manager)}
                          className="text-left font-medium text-teal-400 underline decoration-teal-500/40 underline-offset-2 transition-colors hover:text-teal-300"
                        >
                          {row.manager}
                        </button>
                      ) : (
                        row.manager
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-300 sm:px-5">{row.city}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-300 sm:px-5">{row.state}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-300 sm:px-5">
                      {row.applicantCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-400 sm:px-5">{row.createdDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
