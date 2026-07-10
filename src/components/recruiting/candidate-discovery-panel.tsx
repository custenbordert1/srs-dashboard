"use client";

import { useCandidateDiscovery } from "@/hooks/use-candidate-discovery";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  buildDiscoveryChecklist,
  sourceLabel,
  sourceTone,
} from "@/lib/p170-unified-candidate-discovery/presentation";
import { useEffect, useState } from "react";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

const TONE_CLASS: Record<"success" | "warning" | "neutral", string> = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  neutral: "border-zinc-700 bg-zinc-900/60 text-zinc-300",
};

type CandidateDiscoveryPanelProps = {
  /** Keeps the panel in sync with the main queue search box. */
  syncedQuery?: string;
  onOpenCandidate?: (candidateId: string) => void;
};

export function CandidateDiscoveryPanel({
  syncedQuery,
  onOpenCandidate,
}: CandidateDiscoveryPanelProps) {
  const [query, setQuery] = useState(syncedQuery ?? "");
  const debounced = useDebouncedValue(query, 300);
  const { result, warnings, loading, error, search, clear } = useCandidateDiscovery();

  // Adopt the main search term when it changes (server search stays authoritative).
  useEffect(() => {
    if (typeof syncedQuery === "string") setQuery(syncedQuery);
  }, [syncedQuery]);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      clear();
      return;
    }
    void search(q);
  }, [debounced, search, clear]);

  return (
    <section className="rounded-2xl border border-teal-500/25 bg-zinc-950/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-300/90">
            Unified candidate discovery
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Server search across the durable ingestion store with automatic Breezy rescue — finds
            candidates even before the preview scan reaches their position.
          </p>
        </div>
        <span className="rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
          P170
        </span>
      </div>

      <div className="mt-3">
        <input
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-teal-500/50 focus:outline-none"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email, phone, candidate ID, or position ID"
        />
        <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
          {loading ? <span>Searching server…</span> : null}
          {!loading && result?.found && result.source ? (
            <span
              className={`rounded-md border px-1.5 py-0.5 font-medium ${TONE_CLASS[sourceTone(result.source)]}`}
            >
              Source: {sourceLabel(result.source)}
            </span>
          ) : null}
          {result?.hydratedIntoStore ? (
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">
              Hydrated into ingestion store
            </span>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

      {warnings.length > 0 ? (
        <p className="mt-2 text-[11px] text-amber-300/80">{warnings.join(" · ")}</p>
      ) : null}

      {result && !result.found && !loading && result.query.raw ? (
        <p className="mt-3 text-xs text-zinc-500">
          No candidate found for “{result.query.raw}” in the ingestion store or via Breezy rescue.
        </p>
      ) : null}

      {result?.found && result.candidate ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-50">{result.candidate.name}</p>
                <p className="text-xs text-zinc-400">{result.candidate.email ?? "—"}</p>
              </div>
              {onOpenCandidate ? (
                <button
                  type="button"
                  onClick={() => onOpenCandidate(result.candidate!.candidateId)}
                  className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-2.5 py-1 text-[11px] font-medium text-teal-100 hover:bg-teal-500/20"
                >
                  Open
                </button>
              ) : null}
            </div>
            <dl className="mt-3 space-y-1 text-[11px] text-zinc-400">
              <div className="flex justify-between gap-2">
                <dt>Candidate ID</dt>
                <dd className="font-mono text-zinc-300">{result.candidate.candidateId}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Position</dt>
                <dd className="text-right text-zinc-300">
                  {result.candidate.positionName ?? result.candidate.positionId ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Applied</dt>
                <dd className="text-zinc-300">{formatTimestamp(result.candidate.appliedDate)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Location</dt>
                <dd className="text-zinc-300">
                  {[result.candidate.city, result.candidate.state].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
            </dl>
          </div>

          {result.discovery ? (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Candidate discovery status
              </p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {buildDiscoveryChecklist(result.discovery).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-zinc-300">
                      <span className={item.ok ? "text-emerald-400" : "text-zinc-600"}>
                        {item.ok ? "✓" : "○"}
                      </span>
                      {item.label}
                    </span>
                    {item.detail ? (
                      <span className="text-[10px] text-zinc-500">{item.detail}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
