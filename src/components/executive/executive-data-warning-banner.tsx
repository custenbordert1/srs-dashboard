"use client";

import { UI_SURFACE } from "@/lib/ui-tokens";
import type { ExecutiveIntelligenceRouteMeta } from "@/lib/executive-routes/executive-intelligence-route";

type ExecutiveDataWarningBannerProps = {
  meta?: ExecutiveIntelligenceRouteMeta | null;
  warnings?: string[];
  onRefresh?: () => void;
};

export function ExecutiveDataWarningBanner({
  meta,
  warnings = [],
  onRefresh,
}: ExecutiveDataWarningBannerProps) {
  const messages = [...warnings];
  if (meta?.deferred) {
    messages.push("Serving cached intelligence while Breezy/MEL refresh completes in the background.");
  }
  if (meta?.partialSync) {
    messages.push("Candidate sync is partial — counts may increase after Breezy hydration.");
  }
  if (!meta?.melOk) {
    messages.push("MEL projects sheet was unavailable or slow — territory coverage alerts may be incomplete.");
  }
  if (meta?.timedOut) {
    messages.push("Route deadline reached — showing the fastest available snapshot.");
  }

  const unique = [...new Set(messages.filter(Boolean))];
  if (unique.length === 0) return null;

  return (
    <div className={`${UI_SURFACE.panel} border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100`}>
      <p className="font-semibold">Partial executive data</p>
      <ul className="mt-1 list-inside list-disc text-xs text-amber-100/90">
        {unique.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      {onRefresh ? (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-amber-50 underline"
          onClick={onRefresh}
        >
          Refresh now
        </button>
      ) : null}
    </div>
  );
}
