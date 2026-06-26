"use client";

import {
  ActionChip,
  AICommandCenterLoadingSkeleton,
  AIResponseCard,
  AssistantAvatar,
  EmptyState,
  ExecutiveButton,
  ExecutiveCard,
  ExecutivePanelError,
  ExecutiveWarningList,
  formatChatTimestamp,
  GlassPanel,
  IconSparkles,
  MetricCard,
  SectionHeader,
  TypingIndicator,
} from "@/components/executive/ui";
import type {
  CommandCenterChatMessage,
  CommandCenterDashboardSnapshot,
  CommandCenterSuggestedPrompt,
} from "@/lib/ai-command-center/types";
import { useCallback, useEffect, useRef, useState } from "react";

function useSessionId(): string {
  const ref = useRef<string | null>(null);
  if (!ref.current) {
    ref.current = crypto.randomUUID();
  }
  return ref.current;
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
    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
      {prompts.map((prompt) => (
        <ActionChip key={prompt.id} variant="prompt" disabled={disabled} onClick={() => onSelect(prompt.message)}>
          {prompt.label}
        </ActionChip>
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
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
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
        inputRef.current?.focus({ preventScroll: true });
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
    return <AICommandCenterLoadingSkeleton />;
  }

  if (error && !dashboard) {
    return (
      <ExecutivePanelError title="Executive AI Assistant" message={error} onRetry={() => void loadDashboard()} />
    );
  }

  if (!dashboard) return null;

  const metrics = dashboard.metrics;
  const hasHistory = messages.length > 0;

  return (
    <ExecutiveCard id="ai-command-center" variant="premium" className="ex-fade-in overflow-hidden">
      <SectionHeader
        eyebrow="Your executive operating layer"
        title="Executive AI Assistant"
        badge="Preview · P77 Governed"
        badgeTone="preview"
        subtitle={`Platform health ${dashboard.platformHealth.score ?? "—"}% · ${dashboard.platformHealth.status}`}
        actions={
          <>
            <ExecutiveButton onClick={() => void resetSession()}>Reset chat</ExecutiveButton>
            <ExecutiveButton onClick={() => void loadDashboard()}>Refresh</ExecutiveButton>
          </>
        }
      />

      {warnings.length > 0 ? (
        <div className="mt-6">
          <ExecutiveWarningList warnings={warnings} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard compact label="Questions today" value={metrics.questionsAsked} icon={<IconSparkles size={16} />} />
        <MetricCard compact label="Recommendations" value={metrics.recommendationsGenerated} />
        <MetricCard compact label="Hours saved (est.)" value={metrics.estimatedRecruiterHoursSaved} />
        <MetricCard
          compact
          label="Avg confidence"
          value={metrics.decisionConfidence != null ? `${metrics.decisionConfidence}%` : "—"}
        />
        <MetricCard
          compact
          label="Avg response"
          value={metrics.averageResponseTimeMs != null ? `${metrics.averageResponseTimeMs}ms` : "—"}
        />
      </div>

      <GlassPanel soft className="mt-10 overflow-hidden !rounded-3xl !p-0">
        <div
          ref={chatScrollRef}
          className="max-h-[36rem] min-h-[16rem] space-y-6 overflow-y-auto px-5 py-7 sm:px-7"
        >
          {!hasHistory ? (
            <EmptyState
              centered
              icon={<IconSparkles size={22} />}
              title="Your executive advisor is ready."
              description="Ask about recruiting health, approvals, automation, or territory risk. Responses are preview-only and governed."
            >
              <SuggestedPromptChips
                prompts={dashboard.suggestedPrompts}
                disabled={typing}
                onSelect={(message) => void sendMessage(message)}
              />
            </EmptyState>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`ex-fade-in ${msg.role === "user" ? "flex justify-end" : ""}`}>
                {msg.role === "user" ? (
                  <div className="max-w-[85%]">
                    <p className="mb-1 text-right text-[10px] text-zinc-600">{formatChatTimestamp(msg.at)}</p>
                    <div className="rounded-2xl rounded-br-md bg-sky-500/12 px-4 py-3 text-sm leading-relaxed text-sky-50 ring-1 ring-inset ring-sky-500/15">
                      {msg.content}
                    </div>
                  </div>
                ) : msg.response ? (
                  <div className="flex max-w-full gap-3">
                    <AssistantAvatar />
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-400">Executive Advisor</span>
                        <span className="text-[10px] text-zinc-600">{formatChatTimestamp(msg.at)}</span>
                      </div>
                      <AIResponseCard response={msg.response} streaming={msg.id === streamingId} />
                      {msg.response.followUpQuestions.length > 0 ? (
                        <div className="mt-5">
                          <p className="mb-2.5 text-xs font-medium text-zinc-500">Continue the conversation</p>
                          <div className="flex flex-wrap gap-2">
                            {msg.response.followUpQuestions.map((q) => (
                              <ActionChip
                                key={q}
                                variant="followup"
                                disabled={typing}
                                onClick={() => void sendMessage(q)}
                              >
                                {q}
                              </ActionChip>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-300">{msg.content}</p>
                )}
              </div>
            ))
          )}
          {typing ? <TypingIndicator /> : null}
        </div>

        <div className="border-t border-white/[0.04] bg-zinc-950/30 px-5 py-5 backdrop-blur-sm sm:px-7">
          {hasHistory ? (
            <div className="mb-5">
              <p className="mb-2.5 text-xs font-medium text-zinc-500">Suggested prompts</p>
              <SuggestedPromptChips
                prompts={dashboard.suggestedPrompts}
                disabled={typing}
                onSelect={(message) => void sendMessage(message)}
              />
            </div>
          ) : null}

          <form
            className="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your executive advisor anything about recruiting operations…"
              disabled={typing}
              className="flex-1 rounded-2xl bg-zinc-950/50 px-4 py-3 text-sm text-zinc-100 ring-1 ring-inset ring-white/[0.06] placeholder:text-zinc-500 focus:outline-none focus:ring-sky-500/30"
            />
            <ExecutiveButton type="submit" variant="primary" disabled={typing || !input.trim()}>
              Send
            </ExecutiveButton>
          </form>
        </div>
      </GlassPanel>
    </ExecutiveCard>
  );
}
