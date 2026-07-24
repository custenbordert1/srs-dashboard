"use client";

import type { PaperworkPreviewModel } from "@/lib/p258-hiring-workspace";

type Props = {
  preview: PaperworkPreviewModel;
  onClose: () => void;
  onConfirmPreview: () => void;
};

export function HiringWorkspacePaperworkPreviewModal({
  preview,
  onClose,
  onConfirmPreview,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Send paperwork preview"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl">
        <header className="border-b border-zinc-800 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
            {preview.liveSendWired
              ? "Send paperwork — preview then live confirm"
              : "Send paperwork — preview only"}
          </p>
          <h3 className="mt-0.5 text-lg font-semibold text-zinc-50">
            {preview.liveSendWired ? "Review before live send" : "Confirm preview"}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {preview.liveSendWired
              ? "Continue opens the typed production confirmation. Cancel stops with no Dropbox write."
              : "No Dropbox Sign send and no workflow write will run from this confirmation."}
          </p>
        </header>

        <div className="space-y-3 px-4 py-4">
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            {preview.warning}
          </p>

          <dl className="space-y-2">
            {preview.details.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  {row.label}
                </dt>
                <dd className="max-w-[65%] text-right text-zinc-200 break-words">{row.value}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-400">
            <p>
              Eligibility: <span className="text-zinc-200">{preview.eligibility.verdict}</span>
            </p>
            <p className="mt-1">
              Action: <span className="font-mono text-zinc-300">{preview.action}</span> · liveSendWired=
              {String(preview.liveSendWired)}
            </p>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmPreview}
            className="rounded-md border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-500/25"
          >
            {preview.confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
