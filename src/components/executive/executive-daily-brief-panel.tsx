"use client";

import type { ExecutiveDailyBriefSnapshot } from "@/lib/executive-daily-brief/types";
import { useCallback, useEffect, useState } from "react";

function MetricLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}

export function ExecutiveDailyBriefPanel() {
  const [brief, setBrief] = useState<ExecutiveDailyBriefSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/executive-daily-brief", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        brief?: ExecutiveDailyBriefSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.brief) {
        setError(data.error ?? "Failed to load executive daily brief");
        return;
      }
      setBrief(data.brief);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load executive daily brief");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !brief) {
    return (
      <section id="executive-daily-brief" className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Executive Daily Brief</h2>
        <div className="mt-3 h-32 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !brief) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Executive Daily Brief</h2>
        <p className="mt-2 text-sm text-amber-100/90">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!brief) return null;

  const m = brief.metrics;
  const deltaLabel =
    m.applicantsDelta > 0
      ? `+${m.applicantsDelta} vs yesterday`
      : m.applicantsDelta < 0
        ? `${m.applicantsDelta} vs yesterday`
        : "flat vs yesterday";

  return (
    <section className="rounded-2xl border border-indigo-500/30 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Executive Daily Brief</h2>
            <span className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-200">
              Preview Mode
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            P72 cross-engine summary · read-only · last refresh {brief.lastDataRefresh}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-xs text-indigo-100/90">
          {warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
          <p className="text-base font-semibold text-zinc-50">{brief.greeting}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recruiting summary</p>
          <div className="mt-3 space-y-2">
            <MetricLine label="Applicants today" value={m.applicantsToday} />
            <MetricLine label="Applicants vs yesterday" value={deltaLabel} />
            <MetricLine label="Paperwork sent today" value={m.paperworkSentToday} />
            <MetricLine label="Paperwork signed today" value={m.paperworkSignedToday} />
            <MetricLine label="Pending signatures" value={m.pendingSignatures} />
            <MetricLine label="Waiting 48+ hours" value={m.waitingOver48Hours} />
            <MetricLine label="Ready for work today" value={m.readyForWorkToday} />
            <MetricLine label="Human review" value={m.humanReviewCount} />
            {m.topRecruitingSource ? (
              <MetricLine
                label="Top recruiting source"
                value={`${m.topRecruitingSource} (${m.topRecruitingSourceCount})`}
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Markets needing growth</p>
            {brief.marketsNeedingGrowth.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {brief.marketsNeedingGrowth.map((market) => (
                  <li key={market.marketLabel}>
                    {market.marketLabel} — Need {market.recommendedNewReps} rep
                    {market.recommendedNewReps === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">No markets flagged for additional hiring.</p>
            )}
            <p className="mt-3 text-xs text-zinc-500">
              Recommended new reps (total): {m.recommendedNewReps}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Automation</p>
            <p className="mt-2 text-sm text-zinc-300">
              Paperwork execution: {brief.automation.statusLabel}
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              Live sends: {brief.automation.liveSendsEnabled ? "Enabled" : "Disabled"}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Risks</p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {brief.risks.map((risk) => (
                <li key={risk.label}>
                  {risk.count} {risk.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-300">
        {brief.summaryText}
      </pre>
    </section>
  );
}
