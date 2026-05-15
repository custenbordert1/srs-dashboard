"use client";

import type { SheetDataResult, SheetRow } from "@/lib/google-sheet-csv";
import {
  calendarAgeDays,
  parseApplicantCount,
  parseCreatedDate,
} from "@/lib/post-automation";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";
import { useEffect, useMemo, useState } from "react";

type AttentionPriority = "Critical" | "High" | "Medium" | "Healthy";

type RecommendedAction = "Repost" | "Fix Link" | "DM Review" | "—";

type NeedsAttentionRow = {
  priority: AttentionPriority;
  jobTitle: string;
  city: string;
  state: string;
  applicantCount: number;
  daysOpen: number | null;
  recommendedAction: RecommendedAction;
};

const JOB_TITLE_ALIASES = ["job title", "title", "role", "position", "job"];

const PRIORITY_BADGE_STYLES: Record<AttentionPriority, string> = {
  Critical: "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
  High: "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
  Medium: "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/30",
  Healthy: "bg-green-500/15 text-green-200 ring-1 ring-green-500/30",
};

const PRIORITY_ROW_STYLES: Record<AttentionPriority, string> = {
  Critical: "bg-red-500/[0.07] hover:bg-red-500/10",
  High: "bg-orange-500/[0.07] hover:bg-orange-500/10",
  Medium: "bg-yellow-500/[0.07] hover:bg-yellow-500/10",
  Healthy: "bg-green-500/[0.07] hover:bg-green-500/10",
};

const PRIORITY_RANK: Record<AttentionPriority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Healthy: 3,
};

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const set = new Map<string, string>();
  for (const h of headers) {
    set.set(normHeader(h), h);
  }
  for (const alias of aliases) {
    const direct = set.get(normHeader(alias));
    if (direct) return direct;
  }
  for (const h of headers) {
    const n = normHeader(h);
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (n === a || n.includes(a) || a.includes(n)) return h;
    }
  }
  return undefined;
}

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function isBreezyYes(raw: string): boolean {
  return raw.trim().toLowerCase() === "yes";
}

function resolveAttentionPriority(
  applicants: number,
  breezyYes: boolean,
): AttentionPriority {
  if (applicants === 0 && !breezyYes) return "Critical";
  if (applicants === 0) return "High";
  if (applicants <= 2) return "Medium";
  return "Healthy";
}

function rowNeedsAttention(
  applicants: number,
  breezyYes: boolean,
  daysOpen: number | null,
): boolean {
  const notLinked = !breezyYes;
  const zeroApplicants = applicants === 0;
  const olderThanSeven = daysOpen !== null && daysOpen > 7;
  return zeroApplicants || notLinked || olderThanSeven;
}

function resolveRecommendedAction(
  applicants: number,
  breezyYes: boolean,
  daysOpen: number | null,
): RecommendedAction {
  if (daysOpen !== null && daysOpen >= 14) return "DM Review";
  if (applicants === 0 && daysOpen !== null && daysOpen >= 7) return "Repost";
  if (!breezyYes) return "Fix Link";
  return "—";
}

function formatDaysOpen(days: number | null): string {
  if (days === null) return "—";
  return String(days);
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
        <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/30" />
      </div>
    </section>
  );
}

function QueueHeader({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h2 id="needs-attention-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
        Needs attention
      </h2>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
    </div>
  );
}

function NeedsAttentionQueue() {
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
    const jobTitleKey = pickColumn(data.headers, JOB_TITLE_ALIASES);

    const missing: string[] = [];
    if (!keys.applicantCount) missing.push("Applicant Count");
    if (!keys.breezyLinked) missing.push("BreezyHR Linked");
    if (!keys.createdDate) missing.push("Created Date");
    if (!jobTitleKey) missing.push("Job Title");

    if (!keys.applicantCount || !keys.breezyLinked || !keys.createdDate) {
      return { flaggedRows: [] as NeedsAttentionRow[], missingColumns: missing };
    }

    const out: NeedsAttentionRow[] = [];

    for (const row of data.rows) {
      if (keys.status && !isOpenPostStatus(cell(row, keys.status))) continue;

      const applicants = parseApplicantCount(cell(row, keys.applicantCount));
      const breezyYes = isBreezyYes(cell(row, keys.breezyLinked));
      const created = parseCreatedDate(cell(row, keys.createdDate));
      const daysOpen = created ? calendarAgeDays(created) : null;

      if (!rowNeedsAttention(applicants, breezyYes, daysOpen)) continue;

      const priority = resolveAttentionPriority(applicants, breezyYes);

      out.push({
        priority,
        jobTitle: cell(row, jobTitleKey) || "—",
        city: cell(row, keys.city) || "—",
        state: cell(row, keys.state) || "—",
        applicantCount: applicants,
        daysOpen,
        recommendedAction: resolveRecommendedAction(applicants, breezyYes, daysOpen),
      });
    }

    out.sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      const da = a.daysOpen ?? -1;
      const db = b.daysOpen ?? -1;
      return db - da;
    });

    return { flaggedRows: out, missingColumns: missing };
  }, [data]);

  const totalFlagged = flaggedRows.length;
  const subtitle =
    "Open posts with 0 applicants, Breezy not linked, or created more than 7 days ago.";

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
          <QueueHeader subtitle={subtitle} />
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
        <QueueHeader subtitle={subtitle} />
        <span className="shrink-0 rounded-full border border-rose-500/25 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200">
          {totalFlagged} flagged
        </span>
      </div>

      {missingColumns.length > 0 ? (
        <div className="border-b border-zinc-800/80 px-4 py-3 sm:px-5">
          <p className="text-xs text-amber-200/90">
            Missing columns: <span className="font-medium">{missingColumns.join(", ")}</span>.
          </p>
        </div>
      ) : null}

      {totalFlagged === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 sm:px-5">
          No rows need attention right now.
        </p>
      ) : (
        <div className="overflow-x-auto px-4 pb-4 sm:px-5">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
                <th className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">Priority</th>
                <th className="min-w-[140px] px-3 py-3 font-medium sm:px-4">Job Title</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">City</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">State</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium sm:px-4">
                  Applicant Count
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium sm:px-4">
                  Days Open
                </th>
                <th className="min-w-[120px] px-3 py-3 font-medium sm:px-4">Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {flaggedRows.map((row, i) => (
                <tr key={i} className={PRIORITY_ROW_STYLES[row.priority]}>
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE_STYLES[row.priority]}`}
                    >
                      {row.priority}
                    </span>
                  </td>
                  <td className="max-w-[220px] whitespace-pre-wrap px-3 py-3 text-zinc-100 sm:px-4">
                    {row.jobTitle}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-300 sm:px-4">{row.city}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-300 sm:px-4">{row.state}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-zinc-200 sm:px-4">
                    {row.applicantCount}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-zinc-400 sm:px-4">
                    {formatDaysOpen(row.daysOpen)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-200 sm:px-4">
                    {row.recommendedAction}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default NeedsAttentionQueue;
