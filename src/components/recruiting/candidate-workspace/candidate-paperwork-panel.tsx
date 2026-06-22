"use client";

import { paperworkStatusLabel } from "@/lib/candidate-paperwork";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

type CandidatePaperworkPanelProps = {
  paperworkStatus: PaperworkStatus;
  sentAt: string | null;
  signedAt: string | null;
  sending?: boolean;
  canSend: boolean;
  onSend: () => void;
  onRefresh: () => void;
};

export function CandidatePaperworkPanel({
  paperworkStatus,
  sentAt,
  signedAt,
  sending,
  canSend,
  onSend,
  onRefresh,
}: CandidatePaperworkPanelProps) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Paperwork</h3>
      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Dropbox Sign status</dt>
          <dd className="text-zinc-200">{paperworkStatusLabel(paperworkStatus)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Sent</dt>
          <dd className="text-zinc-200">{formatWhen(sentAt)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Completed</dt>
          <dd className="text-zinc-200">{formatWhen(signedAt)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSend || sending}
          onClick={onSend}
          className="rounded-md border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-100 disabled:opacity-40"
        >
          {sending ? "Sending…" : "Send paperwork"}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Refresh status
        </button>
      </div>
    </section>
  );
}
