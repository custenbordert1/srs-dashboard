"use client";

import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { AiActionKind, AiActionPayload, AiActionProposal } from "@/lib/ai-action-engine";
import { useState } from "react";

type AiInsightActionButtonProps = {
  proposal: AiActionProposal;
  recommendation: string;
  compact?: boolean;
  onExecuted?: (message: string) => void;
};

export function AiInsightActionButton({
  proposal,
  recommendation,
  compact = false,
  onExecuted,
}: AiInsightActionButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const execute = async () => {
    setRunning(true);
    try {
      const res = await fetchWithTimeout("/api/recruiting/ai-action-engine/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          insightId: proposal.insightId,
          recommendation,
          actionKind: proposal.actionKind,
          payload: proposal.payload,
        }),
        timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as { ok?: boolean; result?: { message?: string; error?: string } };
      const message = parsed.result?.message ?? parsed.result?.error ?? "Action completed";
      setResult(message);
      onExecuted?.(message);
      setConfirming(false);
    } catch {
      setResult("Action failed");
    } finally {
      setRunning(false);
    }
  };

  if (result) {
    return <span className="text-xs text-teal-300/90">{result}</span>;
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-400">Confirm {proposal.label}?</span>
        <button
          type="button"
          disabled={running}
          onClick={() => void execute()}
          className="rounded border border-teal-600/40 px-2 py-0.5 text-xs text-teal-200 hover:bg-teal-500/10 disabled:opacity-50"
        >
          {running ? "Running…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={
        compact
          ? "rounded border border-teal-600/30 px-2 py-0.5 text-[10px] text-teal-200 hover:bg-teal-500/10"
          : "rounded-lg border border-teal-600/40 px-2.5 py-1 text-xs text-teal-200 hover:bg-teal-500/10"
      }
    >
      {proposal.label}
    </button>
  );
}

export type BulkActionItem = {
  insightId: string;
  recommendation: string;
  actionKind: AiActionKind;
  payload: AiActionPayload;
};

export function AiBulkActionButton({
  actions,
  label,
  onExecuted,
}: {
  actions: BulkActionItem[];
  label: string;
  onExecuted?: (count: number) => void;
}) {
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (actions.length === 0) return;
    setRunning(true);
    try {
      const res = await fetchWithTimeout("/api/recruiting/ai-action-engine/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, bulk: true, actions }),
        timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as { ok?: boolean; results?: Array<{ ok: boolean }> };
      const count = parsed.results?.filter((row) => row.ok).length ?? 0;
      onExecuted?.(count);
    } finally {
      setRunning(false);
    }
  };

  return (
    <button
      type="button"
      disabled={running || actions.length === 0}
      onClick={() => void run()}
      className="rounded-lg border border-teal-600/40 px-3 py-1.5 text-xs text-teal-200 hover:bg-teal-500/10 disabled:opacity-50"
    >
      {running ? "Executing…" : `${label} (${actions.length})`}
    </button>
  );
}
