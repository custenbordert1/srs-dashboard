"use client";

import { BREEZY_UI_REFERENCE_DATE_RANGE, type BreezyCandidatesDebugResult } from "@/lib/breezy-api";
import {
  DataHealthRequestTimeoutError,
  fetchWithTimeout,
  logDataHealthTiming,
} from "@/lib/data-health-fetch";
import { useCallback, useState } from "react";

const DEFAULT_FROM = BREEZY_UI_REFERENCE_DATE_RANGE.start;
const DEFAULT_TO = BREEZY_UI_REFERENCE_DATE_RANGE.end;

const PARITY_CLIENT_TIMEOUT_MS = 15_000;

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type ParityResponse = BreezyCandidatesDebugResult & {
  cached?: boolean;
  comparison?: {
    gapVsBreezyUi?: number;
    apiParityTotalBeforeTerritory?: number;
  };
};

function buildParityFallback(error: string): ParityResponse {
  return {
    ok: false,
    error,
    fetchedAt: new Date().toISOString(),
  };
}

export function BreezyParityDiagnostics() {
  const [from, setFrom] = useState<string>(DEFAULT_FROM);
  const [to, setTo] = useState<string>(DEFAULT_TO);
  const [includeClosed, setIncludeClosed] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialNotice, setPartialNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ParityResponse | null>(null);
  const [cached, setCached] = useState(false);

  const runParityCheck = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      setPartialNotice(null);
      const started = performance.now();

      const params = new URLSearchParams({
        from,
        to,
        includeClosed: includeClosed ? "true" : "false",
      });
      if (includeArchived) params.set("includeArchived", "true");
      if (force) params.set("force", "true");

      const path = `/api/breezy/candidates/debug?${params.toString()}`;

      try {
        const res = await fetchWithTimeout(path, {
          timeoutMs: PARITY_CLIENT_TIMEOUT_MS,
          label: force ? "breezy-debug-force" : "breezy-debug",
          init: { cache: "no-store" },
        });
        const parsed = (await res.json()) as ParityResponse;
        logDataHealthTiming("parity-scan-ms", performance.now() - started, force ? "complete" : "complete");

        if (!res.ok || !parsed.ok) {
          const errText = !parsed.ok ? parsed.error : `HTTP ${res.status}`;
          if (
            errText.toLowerCase().includes("rate limit") ||
            errText.includes("429")
          ) {
            setResult(buildParityFallback(errText));
            setError(
              "Breezy rate limit hit. Wait a minute, then use Force refresh or rely on the 5-minute server cache.",
            );
            return;
          }
          setError(errText);
          setResult(null);
          return;
        }

        setResult(parsed);
        setCached(Boolean(parsed.cached));
      } catch (err) {
        logDataHealthTiming("breezy-debug-ms", performance.now() - started, "client-timeout-or-error");

        if (err instanceof DataHealthRequestTimeoutError) {
          setPartialNotice(
            "Client stopped waiting after 15s. The server may still be scanning — checking for a cached parity result…",
          );
          try {
            const cacheParams = new URLSearchParams({
              from,
              to,
              includeClosed: includeClosed ? "true" : "false",
            });
            if (includeArchived) cacheParams.set("includeArchived", "true");

            const cacheRes = await fetchWithTimeout(
              `/api/breezy/candidates/debug?${cacheParams.toString()}`,
              {
                timeoutMs: 8_000,
                label: "breezy-debug-cache-peek",
                init: { cache: "no-store" },
              },
            );
            const cachedParsed = (await cacheRes.json()) as ParityResponse;
            if (cacheRes.ok && cachedParsed.ok) {
              setResult(cachedParsed);
              setCached(true);
              setError(null);
              setPartialNotice(
                "Showing cached parity snapshot (scan may still be running server-side). Use Force refresh when ready.",
              );
              return;
            }
          } catch {
            // fall through to safe fallback
          }

          setError(
            "Parity scan did not finish within 15s and no cached result is available yet. Try Force refresh in a minute.",
          );
          setResult(
            buildParityFallback(
              "Parity scan exceeded client timeout; no cached snapshot available.",
            ),
          );
          return;
        }

        setError(err instanceof Error ? err.message : "Parity check failed");
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [from, to, includeClosed, includeArchived],
  );

  const totalInRange =
    result?.ok === true
      ? (result.publishedCandidatesInRange ?? 0) +
        (result.closedCandidatesInRange ?? 0) +
        (result.archivedCandidatesInRange ?? 0)
      : 0;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Full Breezy parity check</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Diagnostics only — not loaded automatically. Runs published + optional recent closed jobs
            (server cache 5 min). Client waits up to 15s, then shows cache or a safe fallback.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void runParityCheck(false)}
            className="rounded-lg border border-teal-600/50 bg-teal-600/15 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-600/25 disabled:opacity-50"
          >
            {loading ? "Scanning…" : "Run parity check"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runParityCheck(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Force refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-zinc-500">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100"
          />
        </label>
        <label className="text-xs text-zinc-500">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2 lg:col-span-1">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Include recently updated closed positions
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2 lg:col-span-1">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Include archived sample (max 15 recent)
        </label>
      </div>

      {partialNotice ? (
        <p role="status" className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
          {partialNotice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {result?.ok ? (
        <div className="mt-4 space-y-4">
          {cached ? (
            <p className="text-xs text-zinc-500">Served from 5-minute parity cache.</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Total in range" value={totalInRange.toLocaleString()} highlight />
            <Metric label="Published in range" value={(result.publishedCandidatesInRange ?? 0).toLocaleString()} />
            <Metric label="Closed in range" value={(result.closedCandidatesInRange ?? 0).toLocaleString()} />
            <Metric label="Archived in range" value={(result.archivedCandidatesInRange ?? 0).toLocaleString()} />
            <Metric label="Breezy UI target" value="51" />
            <Metric label="Scan duration" value={formatMs(result.scanDurationMs)} />
            <Metric label="Rate limit hit" value={result.rateLimitHit ? "Yes" : "No"} warn={result.rateLimitHit} />
            <Metric
              label="Truncated"
              value={result.truncated ? "Yes" : "No"}
              warn={Boolean(result.truncated)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StateBlock title="Positions scanned" data={result.positionsScannedByState} />
            <StateBlock title="Positions skipped" data={result.positionsSkippedByState} />
          </div>

          {result.syncNotes && result.syncNotes.length > 0 ? (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-400">
              <p className="font-medium text-zinc-300">Sync notes</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {result.syncNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  highlight = false,
  warn = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        highlight
          ? "border-teal-500/40 bg-teal-500/10"
          : warn
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-zinc-800/80 bg-zinc-950/40"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">{value}</p>
    </div>
  );
}

function StateBlock({
  title,
  data,
}: {
  title: string;
  data: { published: number; closed: number; archived: number };
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs">
      <p className="font-medium text-zinc-300">{title}</p>
      <ul className="mt-2 space-y-1 text-zinc-400">
        <li>Published: {data.published.toLocaleString()}</li>
        <li>Closed: {data.closed.toLocaleString()}</li>
        <li>Archived: {data.archived.toLocaleString()}</li>
      </ul>
    </div>
  );
}
