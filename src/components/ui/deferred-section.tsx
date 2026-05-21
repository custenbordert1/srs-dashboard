"use client";

import { TabSkeleton } from "@/components/ui/tab-skeleton";
import { useState, type ReactNode } from "react";

type DeferredSectionProps = {
  title: string;
  description?: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  loading?: boolean;
  skeletonRows?: number;
};

export function DeferredSection({
  title,
  description,
  summary,
  children,
  defaultOpen = false,
  loading = false,
  skeletonRows = 3,
}: DeferredSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left sm:px-5"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-zinc-50 sm:text-lg">{title}</h2>
          {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
          {!open && summary ? <div className="mt-3">{summary}</div> : null}
        </div>
        <span className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400">
          {open ? "Hide" : "Expand"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-zinc-800/80 px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
          {loading ? (
            <TabSkeleton message="Loading section…" rows={skeletonRows} cards={2} />
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
}
