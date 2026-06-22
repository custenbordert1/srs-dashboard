"use client";

import Link from "next/link";
import type { RecruiterTodayItem } from "@/lib/recruiter-dashboard";

const BUCKET_LABEL: Record<RecruiterTodayItem["bucket"], string> = {
  "must-do": "Must do today",
  "should-do": "Should do today",
  monitor: "Monitor",
};

const BUCKET_ORDER: RecruiterTodayItem["bucket"][] = ["must-do", "should-do", "monitor"];

type RecruiterDashboardTodayProps = {
  items: RecruiterTodayItem[];
};

export function RecruiterDashboardToday({ items }: RecruiterDashboardTodayProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">Today</h2>
      <p className="mt-1 text-sm text-zinc-500">Automatic priorities — open any item in the candidate workspace.</p>
      <div className="mt-4 space-y-5">
        {BUCKET_ORDER.map((bucket) => {
          const bucketItems = items.filter((item) => item.bucket === bucket);
          if (bucketItems.length === 0) return null;
          return (
            <div key={bucket}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                {BUCKET_LABEL[bucket]}
              </h3>
              <ul className="mt-2 space-y-2">
                {bucketItems.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200 hover:border-teal-500/40 hover:bg-teal-500/10"
                    >
                      <span>{item.label}</span>
                      <span className="font-semibold tabular-nums text-zinc-50">{item.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
