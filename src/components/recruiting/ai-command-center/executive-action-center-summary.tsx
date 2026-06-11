"use client";

import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { AiActionCenterSnapshot } from "@/lib/ai-action-engine";
import { AiInsightActionButton } from "@/components/recruiting/ai-command-center/ai-insight-action-button";
import { useEffect, useState } from "react";

export function ExecutiveActionCenterSummary() {
  const [center, setCenter] = useState<AiActionCenterSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/recruiting/ai-action-engine", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as { ok?: boolean; center?: AiActionCenterSnapshot };
        if (!cancelled && parsed.ok && parsed.center) setCenter(parsed.center);
      } catch {
        // optional panel
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!center) return null;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-zinc-50">Executive action center</h3>
      <p className="mt-1 text-xs text-zinc-500">
        {center.memorySummary.actionsTaken} actions taken · {center.memorySummary.successRate}% success
      </p>
      <div className="mt-4 space-y-2">
        {center.executiveActions.slice(0, 4).map((action) => (
          <div key={action.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
            <p className="text-sm font-medium text-zinc-100">{action.title}</p>
            <p className="text-xs text-zinc-500">
              Priority {action.priorityScore} · {action.expectedImpact}
            </p>
            {action.proposals[0] ? (
              <div className="mt-2">
                <AiInsightActionButton
                  proposal={action.proposals[0]}
                  recommendation={`${action.title}: ${action.explanation}`}
                  compact
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
