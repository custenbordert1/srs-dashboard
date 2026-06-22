"use client";

import type { CandidateTimelineEntry } from "@/lib/candidate-workspace";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

type CandidateTimelineProps = {
  entries: CandidateTimelineEntry[];
};

export function CandidateTimeline({ entries }: CandidateTimelineProps) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Activity timeline</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">No activity recorded yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="border-l-2 border-zinc-700 pl-3">
              <p className="text-sm font-medium text-zinc-200">{entry.label}</p>
              {entry.detail ? <p className="mt-0.5 text-xs text-zinc-500">{entry.detail}</p> : null}
              <p className="mt-1 text-[10px] text-zinc-600">{formatWhen(entry.createdAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
