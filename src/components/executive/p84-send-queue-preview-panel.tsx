"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { P84SendQueuePreviewReport } from "@/lib/p84-send-queue-preview";
import { useCallback, useEffect, useState } from "react";

export function P84SendQueuePreviewPanel() {
  const [preview, setPreview] = useState<P84SendQueuePreviewReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/p84-send-queue-preview?includeQueue=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        preview?: P84SendQueuePreviewReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.preview) {
        setError(data.error ?? "Failed to load P84 send queue preview");
        return;
      }
      setPreview(data.preview);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load P84 send queue preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !preview) {
    return <ExecutivePanelLoading title="P84 Send Queue Preview" badge="P96 Dry Run" />;
  }

  if (error) {
    return (
      <ExecutivePanelError
        title="P84 Send Queue Preview"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!preview) return null;

  const m = preview.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title={preview.sectionTitle}
        subtitle={`${preview.cohortLabel}. Final dry run — no sends, no persistence.`}
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Approval persisted (sim)" value={m.approvalPersistedSimulationCount.toLocaleString()} />
        <MetricCard label="P84 eligible" value={m.p84EligibleCount.toLocaleString()} />
        <MetricCard label="Send queue" value={m.sendQueueCount.toLocaleString()} />
        <MetricCard label="Blocked from send" value={m.blockedFromSendCount.toLocaleString()} />
        <MetricCard label="Duplicate risk" value={m.duplicateRiskCount.toLocaleString()} />
        <MetricCard label="Invalid email" value={m.invalidEmailCount.toLocaleString()} />
        <MetricCard label="Live sends disabled" value={m.liveSendsDisabledCount.toLocaleString()} />
      </div>
      {preview.sendQueue.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Email</th>
                <th className="pb-2 pr-3">Recruiter</th>
                <th className="pb-2 pr-3">Eligibility</th>
                <th className="pb-2">Send blocked</th>
              </tr>
            </thead>
            <tbody>
              {preview.sendQueue.slice(0, 12).map((entry) => (
                <tr key={entry.candidateId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{entry.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.email || "—"}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.recruiter}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.eligibilityResult}</td>
                  <td className="py-2 text-zinc-400">{entry.sendBlockedReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
