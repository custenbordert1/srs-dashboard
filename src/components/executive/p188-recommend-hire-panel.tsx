"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import { useCallback, useEffect, useState } from "react";

type QueueSummary = Record<string, { count: number; sample: Array<{ redactedCandidateId: string; recommendedOperatorAction: string; blockers: string[] }> }>;

export function P188RecommendHirePanel() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [queues, setQueues] = useState<QueueSummary | null>(null);
  const [bypassCount, setBypassCount] = useState(0);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recruiting/p188-recommend-hire", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        enabled?: boolean;
        message?: string;
        queues?: QueueSummary;
        bypassFindingsCount?: number;
      };
      setEnabled(Boolean(data.enabled));
      setMessage(data.message ?? null);
      setQueues(data.queues ?? null);
      setBypassCount(data.bypassFindingsCount ?? 0);
      setGeneratedAt(new Date().toISOString());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load P188.1 queues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <SectionLoadingCard title="P188 Recommend Hire" badge="P188.1" />;
  }

  if (!enabled) {
    return (
      <ExecutiveCard>
        <SectionHeader
          title="P188 Recommend Hire"
          subtitle="Explicit recruiter hiring recommendation — flags off (idle)."
          badge="P188.1"
        />
        <p className="mt-3 text-sm text-zinc-400">
          Enable with <code className="text-zinc-300">P188_RECOMMENDATION_UI=1</code>. Preview-first;
          no automatic operator approval; no paperwork; no P187 canary.
        </p>
        {message ? (
          <div className="mt-3">
            <SectionDegradedBanner message={message} />
          </div>
        ) : null}
      </ExecutiveCard>
    );
  }

  const ready = queues?.ready_to_recommend?.count ?? 0;
  const blocked = queues?.recommendation_blocked?.count ?? 0;
  const recruiterGap = queues?.recruiter_unresolved?.count ?? 0;
  const jobGap = queues?.job_unresolved?.count ?? 0;

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="P188 Recommend Hire"
          subtitle="Queues for recruiter recommendation readiness. Recommend Hire requires API confirmation preview — no paperwork, no auto-approval."
          badge="P188.1"
        />
        <div className="flex flex-wrap items-center gap-2">
          {generatedAt ? <LastUpdatedBadge at={generatedAt} /> : null}
          <StatusBadge tone="success">no auto-approval</StatusBadge>
          <StatusBadge tone="neutral">paperwork not sent</StatusBadge>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Ready to recommend" value={String(ready)} />
        <MetricCard label="Blocked" value={String(blocked)} />
        <MetricCard label="Recruiter unresolved" value={String(recruiterGap)} />
        <MetricCard label="Job unresolved" value={String(jobGap)} />
        <MetricCard label="Bypass findings" value={String(bypassCount)} />
        <MetricCard
          label="Already recommended"
          value={String(queues?.already_recommended?.count ?? 0)}
        />
      </div>

      {queues?.ready_to_recommend?.sample?.length ? (
        <div className="mt-6 overflow-x-auto">
          <h3 className="mb-2 text-sm font-medium text-zinc-200">Ready sample</h3>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Candidate</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {queues.ready_to_recommend.sample.map((row) => (
                <tr key={row.redactedCandidateId} className="border-t border-zinc-800">
                  <td className="px-2 py-2 font-mono text-xs text-zinc-300">
                    {row.redactedCandidateId}
                  </td>
                  <td className="px-2 py-2 text-zinc-400">{row.recommendedOperatorAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-zinc-500">
            Execute via POST /api/recruiting/p188-recommend-hire with preview then confirmed=true.
            Sibling actions: return_for_more_review, mark_not_qualified, place_on_hold.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">
          No recommendation-ready candidates until recruiter and job recovery succeed.
        </p>
      )}
    </ExecutiveCard>
  );
}
