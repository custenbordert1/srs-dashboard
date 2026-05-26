"use client";

import type { DmToastMessage } from "@/hooks/use-dm-toast";

type DmToastProps = {
  toast: DmToastMessage | null;
  onDismiss: () => void;
};

export function DmToast({ toast, onDismiss }: DmToastProps) {
  if (!toast) return null;

  const toneClass =
    toast.tone === "info"
      ? "border-sky-500/40 bg-sky-500/15 text-sky-100"
      : "border-teal-500/40 bg-teal-500/15 text-teal-100";

  return (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 z-[60] w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-lg shadow-black/40 ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p>{toast.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs opacity-80 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
