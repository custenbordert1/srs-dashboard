"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import { fetchRecruitingSheetData } from "@/lib/dashboard-api-client";
import {
  buildPostAutomationQueue,
  type PostAutomationQueueRow,
  type PriorityLevel,
} from "@/lib/post-automation";
import { useEffect, useMemo, useState } from "react";

const PRIORITY_STYLES: Record<
  PriorityLevel,
  { label: string; className: string }
> = {
  critical: {
    label: "Critical",
    className:
      "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30",
  },
  watch: {
    label: "Watch",
    className:
      "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25",
  },
  healthy: {
    label: "Healthy",
    className:
      "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25",
  },
  new: {
    label: "New",
    className:
      "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/25",
  },
};

function PostAutomationSkeleton() {
  return (
    <section
      aria-labelledby="post-auto-heading"
      aria-busy="true"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <div className="h-6 w-48 animate-pulse rounded bg-zinc-800/80" />
        <div className="mt-2 h-4 max-w-lg animate-pulse rounded bg-zinc-800/60" />
      </div>
      <div className="space-y-3 px-4 py-6 sm:px-5">
        <div className="h-12 w-full animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-zinc-800/40" />
      </div>
    </section>
  );
}

function QueueTable({ rows }: { rows: PostAutomationQueueRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[960px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
            <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">Priority</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">Manager</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">Job Title</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">City</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">State</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">Status</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium text-right sm:px-5">
              Applicant Count
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">Created Date</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">
              Automation Recommendation
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((row, i) => {
            const p = PRIORITY_STYLES[row.priority];
            return (
              <tr key={i} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 align-top sm:px-5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${p.className}`}
                  >
                    {p.label}
                  </span>
                </td>
                <td className="max-w-[140px] whitespace-pre-wrap px-4 py-3 text-zinc-200 sm:px-5">
                  {row.manager}
                </td>
                <td className="max-w-[220px] whitespace-pre-wrap px-4 py-3 font-medium text-zinc-100 sm:px-5">
                  {row.jobTitle}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-300 sm:px-5">{row.city}</td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-300 sm:px-5">{row.state}</td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-300 sm:px-5">{row.status}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.applicantCount}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-400 sm:px-5">
                  {row.createdDateDisplay}
                </td>
                <td className="max-w-[200px] px-4 py-3 text-zinc-200 sm:px-5">
                  {row.recommendation}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PostAutomationQueue() {
  const [data, setData] = useState<SheetDataResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const parsed = await fetchRecruitingSheetData();
        if (!cancelled) {
          setData(parsed);
        }
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

  const computed = useMemo(() => {
    if (!data?.ok || data.headers.length === 0) {
      return { rows: [] as PostAutomationQueueRow[], missingColumns: [] as string[] };
    }
    return buildPostAutomationQueue(data.rows, data.headers);
  }, [data]);

  if (data === undefined) {
    return <PostAutomationSkeleton />;
  }

  if (!data.ok) {
    return (
      <section
        aria-labelledby="post-auto-heading"
        className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
      >
        <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
          <h2 id="post-auto-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Post Automation Queue
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Read-only queue derived from the live sheet (Open / Requested). Breezy posting is not
            wired yet.
          </p>
        </div>
        <div className="px-4 py-6 sm:px-5">
          <p className="text-sm text-zinc-500">
            Load the Google Sheet above to populate this section.
          </p>
        </div>
      </section>
    );
  }

  const { rows, missingColumns } = computed;

  return (
    <section
      aria-labelledby="post-auto-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-2 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
        <div>
          <h2 id="post-auto-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Post Automation Queue
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Rows with Status <span className="text-zinc-400">Open</span> or{" "}
            <span className="text-zinc-400">Requested</span>. Priority uses applicant count and age
            of the req. Recommendations are read-only until Breezy is integrated.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-700/80 bg-zinc-950/60 px-3 py-1 text-xs font-medium text-zinc-400">
          {rows.length} in queue
        </span>
      </div>

      {missingColumns.length > 0 ? (
        <div className="border-b border-zinc-800/80 px-4 py-3 sm:px-5">
          <p className="text-xs text-amber-200/90">
            Expected columns not found in the sheet header row:{" "}
            <span className="font-medium">{missingColumns.join(", ")}</span>. Name columns so they
            match (e.g. Status, Job Title, Applicant Count, Created Date, Manager, City, State).
          </p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 sm:px-5">
          No rows with Status Open or Requested.
        </p>
      ) : (
        <QueueTable rows={rows} />
      )}
    </section>
  );
}
