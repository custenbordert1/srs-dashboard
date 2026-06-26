"use client";

import type { ExecutiveQueryAnswer, ExecutiveQueryDashboardSnapshot } from "@/lib/executive-natural-language-queries";
import { useCallback, useEffect, useState } from "react";

function comparisonArrow(direction: string): string {
  if (direction === "up") return "▲";
  if (direction === "down") return "▼";
  return "—";
}

function QueryCard({
  title,
  primaryValue,
  comparison,
  lines,
  lastRefreshedLabel,
  sourceSystem,
}: {
  title: string;
  primaryValue: number;
  comparison: ExecutiveQueryDashboardSnapshot["cards"][number]["comparison"];
  lines: Array<{ label: string; value: number | string }>;
  lastRefreshedLabel: string;
  sourceSystem: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-50">{primaryValue}</p>
      {comparison ? (
        <p className="mt-1 text-sm text-zinc-400">
          {comparison.label}: {comparison.value}{" "}
          <span
            className={
              comparison.direction === "up"
                ? "text-emerald-300"
                : comparison.direction === "down"
                  ? "text-rose-300"
                  : "text-zinc-400"
            }
          >
            {comparisonArrow(comparison.direction)} {comparison.deltaLabel}
          </span>
        </p>
      ) : null}
      {lines.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-zinc-300">
          {lines.map((line) => (
            <li key={line.label}>
              {line.label}: <span className="font-medium text-zinc-100">{line.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[10px] text-zinc-500">
        Last Updated {lastRefreshedLabel} · {sourceSystem}
      </p>
    </div>
  );
}

export function ExecutiveNaturalLanguageQueriesPanel() {
  const [dashboard, setDashboard] = useState<ExecutiveQueryDashboardSnapshot | null>(null);
  const [answer, setAnswer] = useState<ExecutiveQueryAnswer | null>(null);
  const [question, setQuestion] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(`/api/executive-natural-language-queries${params}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: ExecutiveQueryDashboardSnapshot;
        answer?: ExecutiveQueryAnswer | null;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load executive query preview");
        return;
      }
      setDashboard(data.dashboard);
      setAnswer(data.answer ?? null);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load executive query preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !dashboard) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Executive Queries</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Executive Queries</h2>
        <p className="mt-2 text-sm text-amber-200/90">{error}</p>
      </section>
    );
  }

  if (!dashboard) return null;

  const applicantsCard = dashboard.cards.find((row) => row.id === "applicants_today");
  const paperworkCard = dashboard.cards.find((row) => row.id === "paperwork_today");

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Executive Queries</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Ask operational questions and get read-only answers from live recruiting data.
          </p>
        </div>
        <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-100">
          Preview Mode
        </span>
      </div>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void load(question);
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="How many applicants applied today?"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
        />
        <button
          type="submit"
          className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
        >
          Ask
        </button>
      </form>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {applicantsCard ? (
          <QueryCard
            title={applicantsCard.title}
            primaryValue={applicantsCard.primaryValue}
            comparison={applicantsCard.comparison}
            lines={applicantsCard.lines}
            lastRefreshedLabel={applicantsCard.lastRefreshedLabel}
            sourceSystem={applicantsCard.sourceSystem}
          />
        ) : null}
        {paperworkCard ? (
          <QueryCard
            title={paperworkCard.title}
            primaryValue={paperworkCard.primaryValue}
            comparison={paperworkCard.comparison}
            lines={paperworkCard.lines}
            lastRefreshedLabel={paperworkCard.lastRefreshedLabel}
            sourceSystem={paperworkCard.sourceSystem}
          />
        ) : null}
      </div>

      {answer ? (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/80">Answer</p>
          <p className="mt-1 text-sm font-medium text-zinc-100">{answer.summary}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Source: {answer.sourceSystem} · Refreshed{" "}
            {new Date(answer.lastRefreshedAt).toLocaleTimeString()}
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Supported questions</p>
        <ul className="mt-2 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
          {dashboard.supportedQuestions.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  setQuestion(row.question);
                  void load(row.question);
                }}
                className="text-left hover:text-zinc-200"
              >
                {row.question}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 text-xs text-zinc-500">
          {warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
