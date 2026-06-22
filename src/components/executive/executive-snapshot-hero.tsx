"use client";

import Link from "next/link";
import type { ExecutiveSnapshotContent, ExecutiveSnapshotLine } from "@/lib/build-executive-home-snapshot";

type ExecutiveSnapshotHeroProps = {
  snapshot: ExecutiveSnapshotContent;
  lastUpdated?: string | null;
};

function SnapshotColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: ExecutiveSnapshotLine[];
  tone: "risk" | "priority" | "opportunity";
}) {
  const borderClass =
    tone === "risk"
      ? "border-red-500/30"
      : tone === "priority"
        ? "border-amber-500/30"
        : "border-teal-500/30";

  return (
    <div className={`rounded-xl border bg-zinc-950/40 p-4 ${borderClass}`}>
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Nothing flagged right now.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.text} className="text-sm text-zinc-300">
              {item.href ? (
                <Link href={item.href} className="hover:text-teal-200 hover:underline">
                  {item.text}
                </Link>
              ) : (
                item.text
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExecutiveSnapshotHero({ snapshot, lastUpdated }: ExecutiveSnapshotHeroProps) {
  return (
    <section className="rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-zinc-900/60 to-zinc-900/40 p-5 shadow-lg sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-300/90">
            Executive snapshot
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Executive Home</h1>
          <p className="mt-1 text-sm text-zinc-400">What needs attention, what to act on, and where momentum exists.</p>
        </div>
        {lastUpdated ? (
          <p className="text-xs text-zinc-500">
            Updated <span className="text-zinc-400">{lastUpdated}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <SnapshotColumn title="Top risks" items={snapshot.topRisks} tone="risk" />
        <SnapshotColumn title="Top priorities" items={snapshot.topPriorities} tone="priority" />
        <SnapshotColumn title="Top opportunities" items={snapshot.topOpportunities} tone="opportunity" />
      </div>
    </section>
  );
}
