"use client";

import { useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  warning?: string;
  details?: Array<{ label: string; value: string }>;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: (typedPhrase?: string) => void;
  onClose: () => void;
  /** When true, confirm button uses amber (write) styling. */
  writeTone?: boolean;
  /** When set, operator must type this exact phrase before confirm enables. */
  requiredPhrase?: string;
  phraseHint?: string;
};

export function CandidateOperationsConfirmModal({
  title,
  subtitle,
  warning,
  details = [],
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onClose,
  writeTone = false,
  requiredPhrase,
  phraseHint,
}: Props) {
  const [typedPhrase, setTypedPhrase] = useState("");
  const phraseOk = !requiredPhrase || typedPhrase.trim() === requiredPhrase;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl">
        <header className="border-b border-zinc-800 px-4 py-3">
          <p
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              writeTone ? "text-amber-200/80" : "text-teal-200/80"
            }`}
          >
            Explicit confirmation required
          </p>
          <h3 className="mt-0.5 text-lg font-semibold text-zinc-50">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
        </header>

        <div className="space-y-3 px-4 py-4">
          {warning ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              {warning}
            </p>
          ) : null}

          {details.length ? (
            <dl className="space-y-2">
              {details.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    {row.label}
                  </dt>
                  <dd className="max-w-[65%] text-right text-zinc-200 break-words">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {requiredPhrase ? (
            <label className="block space-y-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-amber-200/80">
                Type confirmation phrase
              </span>
              {phraseHint ? <p className="text-[11px] text-zinc-500">{phraseHint}</p> : null}
              <p className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 font-mono text-[10px] text-zinc-400">
                {requiredPhrase}
              </p>
              <input
                type="text"
                value={typedPhrase}
                onChange={(event) => setTypedPhrase(event.target.value)}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="Type the phrase exactly"
              />
            </label>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy || !phraseOk}
            onClick={() => onConfirm(requiredPhrase ? typedPhrase : undefined)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
              writeTone
                ? "border border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
                : "border border-teal-500/40 bg-teal-500/15 text-teal-100 hover:bg-teal-500/25"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
