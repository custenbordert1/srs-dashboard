"use client";

import { AiActionEnginePanel } from "@/components/recruiting/ai-command-center/ai-action-engine-panel";
import { AiInsightActionButton } from "@/components/recruiting/ai-command-center/ai-insight-action-button";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { AiCommandCenterSnapshot, ExecutiveAiAnswer } from "@/lib/ai-recruiting-command-center";
import type { AiActionProposal } from "@/lib/ai-action-engine";
import { useEffect, useState } from "react";

const CATEGORY_STYLES = {
  recommendation: "text-teal-300 border-teal-500/30",
  prediction: "text-violet-300 border-violet-500/30",
  explanation: "text-sky-300 border-sky-500/30",
  action: "text-amber-300 border-amber-500/30",
} as const;

const SEVERITY_STYLES = {
  critical: "bg-red-500/15 text-red-100",
  high: "bg-orange-500/15 text-orange-100",
  medium: "bg-amber-500/15 text-amber-100",
  low: "bg-zinc-500/15 text-zinc-200",
} as const;

type AiResponse = {
  ok?: boolean;
  snapshot?: AiCommandCenterSnapshot;
  error?: string;
};

export function AiCommandCenterHub() {
  const [snapshot, setSnapshot] = useState<AiCommandCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ExecutiveAiAnswer | null>(null);
  const [querying, setQuerying] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [insightProposals, setInsightProposals] = useState<Record<string, AiActionProposal[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/recruiting/ai-command-center", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as AiResponse;
        if (cancelled) return;
        if (!parsed.ok || !parsed.snapshot) {
          setError(parsed.error ?? "Unable to load AI command center.");
          return;
        }
        setError(null);
        setSnapshot(parsed.snapshot);

        const actionRes = await fetchWithTimeout("/api/recruiting/ai-action-engine", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const actionParsed = (await actionRes.json()) as {
          ok?: boolean;
          center?: { insightProposals: Record<string, AiActionProposal[]> };
        };
        if (!cancelled && actionParsed.ok && actionParsed.center) {
          setInsightProposals(actionParsed.center.insightProposals);
        }
      } catch {
        if (!cancelled) setError("Unable to load AI command center.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const askQuestion = async (prompt: string) => {
    if (!prompt.trim()) return;
    setQuerying(true);
    try {
      const res = await fetchWithTimeout("/api/recruiting/ai-command-center/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt }),
        timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
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
    return <p className="text-sm text-zinc-500">Loading AI decision layer…</p>;
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (!snapshot) return null;

  const briefing = snapshot.briefing;
  const topTerritories = snapshot.territoryAdvisor
    .filter((row) => row.attentionScore >= 50)
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">AI Recruiting Command Center</h2>
          <p className="mt-1 text-sm text-zinc-400">
            What needs attention, why, and what action to take — unified across all systems
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setReloadToken((token) => token + 1);
          }}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Refresh insights
        </button>
      </div>

      <section className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4">
        <h3 className="text-base font-semibold text-violet-100">Executive AI assistant</h3>
        <p className="mt-1 text-xs text-violet-200/70">{briefing.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {snapshot.suggestedQuestions.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setQuestion(prompt);
                void askQuestion(prompt);
              }}
              className="rounded-full border border-violet-500/30 px-3 py-1 text-xs text-violet-100 hover:bg-violet-500/10"
            >
              {prompt}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
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
            className="rounded-lg border border-violet-600/40 px-3 py-2 text-xs text-violet-100 hover:bg-violet-500/10 disabled:opacity-50"
          >
            {querying ? "Thinking…" : "Ask"}
          </button>
        </div>
        {answer ? (
          <div className="mt-3 rounded-lg border border-violet-500/20 bg-zinc-950/50 p-3 text-sm text-violet-50/90">
            <p className="text-xs text-violet-300/70">Confidence {answer.confidence}%</p>
            <p className="mt-1">{answer.answer}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Daily executive briefing</h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {[briefing.topRisks, briefing.topWins, briefing.hiringTrends, briefing.criticalAlerts].map((section) => (
            <div key={section.title}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{section.title}</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {section.items.slice(0, 4).map((item) => (
                  <li key={item} className="list-inside list-disc">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">AI insights feed</h3>
        <div className="mt-3 space-y-2">
          {snapshot.insightsFeed.slice(0, 10).map((insight) => (
            <article
              key={insight.id}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${CATEGORY_STYLES[insight.category]}`}
                >
                  {insight.category}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${SEVERITY_STYLES[insight.severity]}`}>
                  {insight.severity}
                </span>
                <span className="text-xs text-zinc-500">{insight.source}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-zinc-100">{insight.title}</p>
              <p className="mt-0.5 text-sm text-zinc-400">{insight.explanation}</p>
              <p className="mt-1 text-xs text-teal-300/90">→ {insight.action}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(insightProposals[insight.id] ?? []).slice(0, 3).map((proposal) => (
                  <AiInsightActionButton
                    key={proposal.id}
                    proposal={proposal}
                    recommendation={`${insight.title}: ${insight.action}`}
                    compact
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-base font-semibold text-zinc-50">Territory AI advisor</h3>
          <div className="mt-3 space-y-3">
            {topTerritories.map((territory) => (
              <div key={String(territory.dmName)} className="rounded-lg border border-zinc-800/80 p-3">
                <p className="text-sm font-medium text-zinc-100">
                  {territory.dmName} · attention {territory.attentionScore}
                </p>
                <p className="mt-1 text-xs text-zinc-400">{territory.coverageRiskExplanation}</p>
                <p className="mt-1 text-xs text-zinc-500">{territory.applicantShortageExplanation}</p>
                <ul className="mt-2 text-xs text-teal-300/90">
                  {territory.recommendedActions.slice(0, 2).map((action) => (
                    <li key={action}>→ {action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-base font-semibold text-zinc-50">Recruiter AI coach</h3>
          <div className="mt-3 space-y-2 text-sm text-zinc-300">
            <p>{snapshot.recruiterCoach.pipelineSummary}</p>
            <p>{snapshot.recruiterCoach.followUpSummary}</p>
            <p>{snapshot.recruiterCoach.conversionSummary}</p>
            <p className="text-zinc-400">{snapshot.recruiterCoach.productivityTrend}</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-zinc-500">Contact today</p>
              <ul className="mt-1 space-y-1 text-xs text-zinc-300">
                {snapshot.recruiterCoach.candidatesToContact.slice(0, 4).map((row) => (
                  <li key={row.candidateId}>
                    {row.name}: {row.reason}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">Jobs needing applicants</p>
              <ul className="mt-1 space-y-1 text-xs text-zinc-300">
                {snapshot.recruiterCoach.jobsNeedingApplicants.slice(0, 4).map((row) => (
                  <li key={row.jobId}>
                    {row.title}: {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Opportunity risk prediction</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Project</th>
                <th className="px-2 py-2">Fill %</th>
                <th className="px-2 py-2">Coverage</th>
                <th className="px-2 py-2">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {snapshot.opportunityRisks.slice(0, 8).map((row) => (
                <tr key={row.opportunityId}>
                  <td className="px-2 py-2">{row.projectName}</td>
                  <td className="px-2 py-2">{row.fillProbability}%</td>
                  <td className="px-2 py-2">{row.coverageRisk}</td>
                  <td className="px-2 py-2">{row.overallRiskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AiActionEnginePanel />
    </div>
  );
}
