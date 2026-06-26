"use client";

import type {
  CommandCenterAssistantResponse,
  CommandCenterChatMessage,
  CommandCenterDashboardSnapshot,
  CommandCenterSuggestedPrompt,
  ExecutiveGreetingSnapshot,
} from "@/lib/ai-command-center/types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

function useSessionId(): string {
  const ref = useRef<string | null>(null);
  if (!ref.current) {
    ref.current = crypto.randomUUID();
  }
  return ref.current;
}

function riskTone(level: CommandCenterAssistantResponse["riskLevel"]): string {
  switch (level) {
    case "critical":
      return "text-rose-300";
    case "high":
      return "text-orange-300";
    case "medium":
      return "text-amber-300";
    default:
      return "text-emerald-300";
  }
}

function StreamingText({ text, active }: { text: string; active: boolean }) {
  const [visible, setVisible] = useState(active ? "" : text);

  useEffect(() => {
    if (!active) {
      setVisible(text);
      return;
    }
    setVisible("");
    let i = 0;
    const timer = setInterval(() => {
      i += 2;
      setVisible(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, 12);
    return () => clearInterval(timer);
  }, [text, active]);

  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{visible}</p>;
}

function ExecutiveGreetingCard({ greeting }: { greeting: ExecutiveGreetingSnapshot }) {
  return (
    <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-zinc-950/40 p-4">
      <p className="text-base font-semibold text-zinc-50">{greeting.headline}</p>
      <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-3">
        <p>
          <span className="text-zinc-500">Recruiting Health:</span>{" "}
          <span className="font-medium text-zinc-100">{greeting.recruitingHealthPercent ?? "—"}%</span>
        </p>
        <p>
          <span className="text-zinc-500">Operations Health:</span>{" "}
          <span className="font-medium text-zinc-100">{greeting.operationsHealthLabel}</span>
        </p>
        <p>
          <span className="text-zinc-500">Automation Readiness:</span>{" "}
          <span className="font-medium text-zinc-100">{greeting.automationReadinessPercent ?? "—"}%</span>
        </p>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Today&apos;s priorities</p>
        <ul className="mt-2 space-y-1 text-sm text-zinc-200">
          {greeting.todayPriorities.length === 0 ? (
            <li className="text-zinc-500">No urgent priorities flagged in this preview snapshot.</li>
          ) : (
            greeting.todayPriorities.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-sky-400">•</span>
                <span>{item}</span>
              </li>
            ))
          )}
        </ul>
      </div>
      <p className="mt-4 text-sm text-zinc-400">{greeting.closing}</p>
    </div>
  );
}

function ConversationCard({
  response,
  streaming,
}: {
  response: CommandCenterAssistantResponse;
  streaming: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Summary</p>
        <StreamingText text={response.summary} active={streaming} />
      </div>

      {response.supportingEvidence.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Evidence</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-400">
            {response.supportingEvidence.slice(0, 6).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {response.recommendedActions.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Recommended actions</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-300">
            {response.recommendedActions.slice(0, 5).map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-2 border-t border-zinc-800/60 pt-3 text-xs sm:grid-cols-3">
        <p>
          <span className="font-semibold text-zinc-500">Approval required?</span>{" "}
          <span className={response.approvalRequired ? "text-amber-300" : "text-emerald-300"}>
            {response.approvalRequired ? "Yes" : "No"}
          </span>
        </p>
        <p>
          <span className="font-semibold text-zinc-500">Risk</span>{" "}
          <span className={`capitalize ${riskTone(response.riskLevel)}`}>{response.riskLevel}</span>
        </p>
        <p>
          <span className="font-semibold text-zinc-500">Confidence</span>{" "}
          <span className="text-zinc-200">{response.confidence != null ? `${response.confidence}%` : "—"}</span>
        </p>
      </div>

      {response.sourceAttributions.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sources</p>
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">
            {response.sourceAttributions.map((source) => (
              <li key={source.phase} className="flex items-center gap-1.5">
                <span className="text-emerald-400">✓</span>
                <span>{source.fullLabel}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {response.dashboardLinks.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {response.dashboardLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded border border-sky-500/40 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-500/10"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SuggestedPromptChips({
  prompts,
  disabled,
  onSelect,
}: {
  prompts: CommandCenterSuggestedPrompt[];
  disabled: boolean;
  onSelect: (message: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((prompt) => (
        <button
          key={prompt.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(prompt.message)}
          className="rounded-full border border-sky-500/35 bg-sky-500/5 px-3 py-1.5 text-xs text-sky-100 hover:bg-sky-500/15 disabled:opacity-50"
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}

export function AICommandCenterPanel() {
  const sessionId = useSessionId();
  const [dashboard, setDashboard] = useState<CommandCenterDashboardSnapshot | null>(null);
  const [messages, setMessages] = useState<CommandCenterChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-command-center?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: CommandCenterDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load AI Command Center");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? data.dashboard.warnings ?? []);

      const histRes = await fetch(`/api/ai-command-center/history?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const hist = (await histRes.json()) as { messages?: CommandCenterChatMessage[] };
      setMessages(hist.messages ?? []);
    } catch {
      setError("Failed to load AI Command Center");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || typing) return;

      setTyping(true);
      setInput("");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: trimmed, at: new Date().toISOString() },
      ]);

      try {
        const res = await fetch("/api/ai-command-center/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, sessionId }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          message?: CommandCenterChatMessage;
          metrics?: CommandCenterDashboardSnapshot["metrics"];
          error?: string;
        };
        if (!res.ok || !data.ok || !data.message) {
          setError(data.error ?? "Chat failed");
          return;
        }
        setStreamingId(data.message.id);
        setMessages((prev) => [...prev, data.message!]);
        if (data.metrics && dashboard) {
          setDashboard({ ...dashboard, metrics: data.metrics });
        }
      } catch {
        setError("Chat failed");
      } finally {
        setTyping(false);
      }
    },
    [dashboard, sessionId, typing],
  );

  const resetSession = useCallback(async () => {
    await fetch("/api/ai-command-center/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    setMessages([]);
    void loadDashboard();
  }, [loadDashboard, sessionId]);

  if (loading && !dashboard) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Executive AI Assistant</h2>
        <div className="mt-3 h-32 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Executive AI Assistant</h2>
        <p className="mt-2 text-sm text-amber-100/90">{error}</p>
      </section>
    );
  }

  if (!dashboard) return null;

  const metrics = dashboard.metrics;
  const greeting = dashboard.executiveGreeting;
  const hasHistory = messages.length > 0;

  return (
    <section id="ai-command-center" className="rounded-2xl border border-sky-500/30 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Executive AI Assistant</h2>
            <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
              Preview · P77 Governed
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Platform health {dashboard.platformHealth.score ?? "—"}% · {dashboard.platformHealth.status}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void resetSession()}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Reset chat
          </button>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {greeting ? <div className="mt-4"><ExecutiveGreetingCard greeting={greeting} /></div> : null}

      <div className="mt-4 grid gap-2 text-center text-xs sm:grid-cols-5">
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-2">
          <p className="text-zinc-500">Questions asked</p>
          <p className="text-lg font-semibold text-zinc-100">{metrics.questionsAsked}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-2">
          <p className="text-zinc-500">Recommendations</p>
          <p className="text-lg font-semibold text-zinc-100">{metrics.recommendationsGenerated}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-2">
          <p className="text-zinc-500">Hrs saved (est.)</p>
          <p className="text-lg font-semibold text-zinc-100">{metrics.estimatedRecruiterHoursSaved}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-2">
          <p className="text-zinc-500">Avg confidence</p>
          <p className="text-lg font-semibold text-zinc-100">{metrics.decisionConfidence ?? "—"}%</p>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-2">
          <p className="text-zinc-500">Avg response</p>
          <p className="text-lg font-semibold text-zinc-100">{metrics.averageResponseTimeMs ?? "—"}ms</p>
        </div>
      </div>

      <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-3">
        {!hasHistory ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-medium text-zinc-300">Ask me anything about recruiting.</p>
            <p className="mt-1 text-xs text-zinc-500">Choose a prompt below or type your own question.</p>
            <div className="mt-4 w-full">
              <SuggestedPromptChips
                prompts={dashboard.suggestedPrompts}
                disabled={typing}
                onSelect={(message) => void sendMessage(message)}
              />
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {msg.role === "user" ? (
                <div className="max-w-[85%] rounded-xl bg-sky-500/15 px-3 py-2 text-sm text-sky-50">{msg.content}</div>
              ) : msg.response ? (
                <div className="max-w-full flex-1">
                  <ConversationCard response={msg.response} streaming={msg.id === streamingId} />
                  {msg.response.followUpQuestions.length > 0 ? (
                    <div className="mt-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Suggested follow-ups
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {msg.response.followUpQuestions.map((q) => (
                          <button
                            key={q}
                            type="button"
                            disabled={typing}
                            onClick={() => void sendMessage(q)}
                            className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-zinc-300">{msg.content}</p>
              )}
            </div>
          ))
        )}
        {typing ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:300ms]" />
            </span>
            Assistant is thinking…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {hasHistory ? (
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Suggested prompts</p>
          <SuggestedPromptChips
            prompts={dashboard.suggestedPrompts}
            disabled={typing}
            onSelect={(message) => void sendMessage(message)}
          />
        </div>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about recruiting operations…"
          disabled={typing}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={typing || !input.trim()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
