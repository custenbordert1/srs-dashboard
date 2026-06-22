"use client";

import type { CommunicationLogEntry } from "@/lib/candidate-workspace";

const CHANNEL_LABEL: Record<CommunicationLogEntry["channel"], string> = {
  call: "Call",
  text: "Text",
  email: "Email",
  "follow-up": "Follow-up",
  note: "Note",
  other: "Update",
};

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

type CandidateCommunicationLogProps = {
  entries: CommunicationLogEntry[];
};

export function CandidateCommunicationLog({ entries }: CandidateCommunicationLogProps) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Communication log</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">No calls, texts, or follow-ups logged yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-300">{CHANNEL_LABEL[entry.channel]}</span>
                <span className="text-[10px] text-zinc-600">{formatWhen(entry.createdAt)}</span>
              </div>
              <p className="mt-1 text-zinc-400">{entry.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
