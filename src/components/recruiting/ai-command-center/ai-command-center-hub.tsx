"use client";

import { AiActionEnginePanel } from "@/components/recruiting/ai-command-center/ai-action-engine-panel";
import { AiInsightActionButton } from "@/components/recruiting/ai-command-center/ai-insight-action-button";
import { DeferredSection } from "@/components/ui/deferred-section";
import { STATUS_TONE_STYLES } from "@/lib/ui/status-tone";
import { fetchAiCommandCenterSnapshot } from "@/lib/cached-ai-command-center-client";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import type { AiCommandCenterSnapshot, ExecutiveAiAnswer } from "@/lib/ai-recruiting-command-center";
import type { AiActionProposal } from "@/lib/ai-action-engine";
import { useCallback, useEffect, useState } from "react";

const SEVERITY_ACCENT = {
  critical: STATUS_TONE_STYLES.critical,
  high: STATUS_TONE_STYLES.warning,
  medium: STATUS_TONE_STYLES.info,
  low: STATUS_TONE_STYLES.info,
} as const;

export function AiCommandCenterHub() {
  const [snapshot, setSnapshot] = useState<AiCommandCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ExecutiveAiAnswer | null>(null);
  const [querying, setQuerying] = useState(false);
  const [insightProposals, setInsightProposals] = useState<Record<string, AiActionProposal[]>>({});
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);

  const loadSnapshot = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAiCommandCenterSnapshot({ force });
      if (result.snapshot) {
        setSnapshot(result.snapshot);
        setStale(Boolean(result.stale));
        if (result.stale && result.error) {
          setError(result.error);
        } else {
          setError(null);
        }
      } else {
        setError(result.error ?? "Unable to load AI command center.");
      }

      if (result.snapshot) {
        try {
          const actionRes = await fetchWithTimeout("/api/recruiting/ai-action-engine", {
            timeoutMs: FETCH_T4_INTELLIGENCE_MS,
          });
          const actionParsed = (await actionRes.json()) as {
            ok?: boolean;
            center?: { insightProposals: Record<string, AiActionProposal[]> };
          };
          if (actionParsed.ok && actionParsed.center) {
            setInsightProposals(actionParsed.center.insightProposals);
          }
        } catch {
          // Action proposals are optional — briefing still renders.
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot(false);
  }, [loadSnapshot]);

  const askQuestion = async (prompt: string) => {
    if (!prompt.trim()) return;
    setQuerying(true);
    try {
      const res = await fetchWithTimeout("/api/recruiting/ai-command-center/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const parsed = (await res.json()) as {
        ok?: boolean;
        answer?: ExecutiveAiAnswer;
        snapshot?: AiCommandCenterSnapshot;
      };
      if (parsed.ok && parsed.answer) {
        setAnswer(parsed.answer);
        if (parsed.snapshot) setSnapshot(parsed.snapshot);
      }
    } finally {
      setQuerying(false);
    }
  };

  if (loading && !snapshot) {
    return <p className="text-sm text-zinc-500">Loading AI command center…</p>;
  }

  if (!snapshot) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm text-amber-100">
          {error ?? "Unable to load AI command center."}
        </p>
        <button
          type="button"
          onClick={() => void loadSnapshot(true)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          Retry
        </button>
      </div>
    );
  }

  const briefing = snapshot.briefing;
  const topTerritories = snapshot.territoryAdvisor
    .filter((row) => row.attentionScore >= 50)
    .slice(0, 4);
  const priorityInsights = snapshot.insightsFeed
    .filter((row) => row.severity === "critical" || row.severity === "high")
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">AI Command Center</h1>
          <p className="text-xs text-zinc-500">What needs attention, why it matters, and what to do next</p>
        </div>
        <button
          type="button"
          onClick={() => void loadSnapshot(true)}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-xs text-amber-100">
            {stale ? "Showing last cached snapshot — " : ""}
            {error}
          </p>
          <button
            type="button"
            onClick={() => void loadSnapshot(true)}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Executive briefing</h2>
        <p className="mt-1 text-xs text-zinc-500">{briefing.summary}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[briefing.topRisks, briefing.topWins, briefing.criticalAlerts].map((section) => (
            <div key={section.title} className="rounded-lg border border-zinc-800/60 bg-zinc-950/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{section.title}</p>
              <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                {section.items.slice(0, 3).map((item) => (
                  <li key={item} className="line-clamp-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-400/80">
              Recommended actions
            </p>
            <ul className="mt-2 space-y-1 text-xs text-zinc-300">
              {priorityInsights.slice(0, 3).map((row) => (
                <li key={row.id} className="line-clamp-2">
                  → {row.action}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-100">Priority recommendations</h2>
        {priorityInsights.length === 0 ? (
          <p className="rounded-lg border border-zinc-800/60 bg-zinc-900/20 px-3 py-2 text-xs text-zinc-600">
            Data not available yet
          </p>
        ) : (
          priorityInsights.map((insight) => {
            const accent = SEVERITY_ACCENT[insight.severity];
            const proposals = insightProposals[insight.id] ?? [];
            const primary = proposals[0];
            const assignProposal = proposals.find(
              (row) =>
                String(row.actionKind).includes("assign") || String(row.actionKind).includes("escalat"),
            );
            const expanded = expandedInsightId === insight.id;
            return (
              <article
                key={insight.id}
                className={`rounded-lg border bg-zinc-900/40 px-3 py-2.5 ${accent.border}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100">{insight.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      <span className="text-zinc-400">Why:</span> {insight.explanation}
                    </p>
                    <p className="mt-1 text-xs text-sky-300/90">
                      <span className="text-zinc-500">Action:</span> {insight.action}
                    </p>
                    {expanded ? (
                      <p className="mt-2 text-xs text-zinc-500">Source: {insight.source}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <ActionButton label="Review" onClick={() => setExpandedInsightId(expanded ? null : insight.id)} />
                    {assignProposal ? (
                      <AiInsightActionButton
                        proposal={assignProposal}
                        recommendation={`${insight.title}: ${insight.action}`}
                        compact
                      />
                    ) : (
                      <ActionButton label="Assign" disabled />
                    )}
                    {primary ? (
                      <AiInsightActionButton
                        proposal={primary}
                        recommendation={`${insight.title}: ${insight.action}`}
                        compact
                      />
                    ) : (
                      <ActionButton label="Resolve" disabled />
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      <DeferredSection
        title="Executive AI assistant"
        description="Ask questions about territories, hires, workload, or project risk"
        summary={<p className="text-xs text-zinc-500">{snapshot.suggestedQuestions[0] ?? "Ask the assistant"}</p>}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {snapshot.suggestedQuestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setQuestion(prompt);
                  void askQuestion(prompt);
                }}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void askQuestion(question);
              }}
              placeholder="Ask about territories, hires, workload, or project risk…"
              className="min-w-[240px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
            <button
              type="button"
              disabled={querying || !question.trim()}
              onClick={() => void askQuestion(question)}
              className="rounded-lg border border-sky-600/40 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/10 disabled:opacity-50"
            >
              {querying ? "Thinking…" : "Ask"}
            </button>
          </div>
          {answer ? (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3 text-sm text-zinc-200">
              <p className="text-xs text-zinc-500">Confidence {answer.confidence}%</p>
              <p className="mt-1">{answer.answer}</p>
            </div>
          ) : null}
        </div>
      </DeferredSection>

      {topTerritories.length === 0 ? (
        <p className="rounded-lg border border-zinc-800/60 bg-zinc-900/20 px-3 py-2 text-xs text-zinc-600">
          Data not available yet
        </p>
      ) : (
        <DeferredSection
          title="Territory AI advisor"
          defaultOpen={topTerritories.length <= 2}
          summary={
            <p className="text-xs text-zinc-500">
              {topTerritories.length} territor{topTerritories.length === 1 ? "y" : "ies"} flagged
            </p>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {topTerritories.map((territory) => (
              <div key={String(territory.dmName)} className="rounded-lg border border-zinc-800/80 p-3">
                <p className="text-sm font-medium text-zinc-100">
                  {territory.dmName} · attention {territory.attentionScore}
                </p>
                <p className="mt-1 text-xs text-zinc-400">{territory.coverageRiskExplanation}</p>
              </div>
            ))}
          </div>
        </DeferredSection>
      )}

      <DeferredSection
        title="Recruiter coach & opportunity risk"
        summary={<p className="text-xs text-zinc-500">Pipeline coaching and MEL risk table</p>}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 text-sm text-zinc-300">
            <p>{snapshot.recruiterCoach.pipelineSummary}</p>
            <p>{snapshot.recruiterCoach.followUpSummary}</p>
          </div>
          {snapshot.opportunityRisks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-1">Project</th>
                    <th className="px-2 py-1">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                  {snapshot.opportunityRisks.slice(0, 6).map((row) => (
                    <tr key={row.opportunityId}>
                      <td className="px-2 py-1.5">{row.projectName}</td>
                      <td className="px-2 py-1.5">{row.overallRiskScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-zinc-600">Data not available yet</p>
          )}
        </div>
      </DeferredSection>

      <DeferredSection title="Action engine" summary={<p className="text-xs text-zinc-500">Bulk actions and history</p>}>
        <AiActionEnginePanel />
      </DeferredSection>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
