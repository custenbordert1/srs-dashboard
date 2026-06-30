"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { P62P83ApprovalPreviewReport } from "@/lib/p62-p83-approval-preview";
import { useCallback, useEffect, useState } from "react";

export function P62P83ApprovalPreviewPanel() {
  const [preview, setPreview] = useState<P62P83ApprovalPreviewReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/p62-p83-approval-preview?includeQueue=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        preview?: P62P83ApprovalPreviewReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.preview) {
        setError(data.error ?? "Failed to load P62/P83 approval preview");
        return;
      }
      setPreview(data.preview);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load P62/P83 approval preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !preview) {
    return <ExecutivePanelLoading title="P62/P83 Approval Preview" badge="P95 Preview" />;
  }

  if (error) {
    return (
      <ExecutivePanelError
        title="P62/P83 Approval Preview"
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
        subtitle={`${preview.cohortLabel}. Manual approval simulation only — nothing auto-approved.`}
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Approval queue" value={m.approvalQueueCount.toLocaleString()} />
        <MetricCard label="Safe to approve" value={m.safeToApprove.toLocaleString()} />
        <MetricCard label="Excluded call-first" value={m.excludedCallFirst.toLocaleString()} />
        <MetricCard label="Expected Paperwork Needed" value={m.expectedPaperworkNeeded.toLocaleString()} />
        <MetricCard label="Expected P84 eligible" value={m.expectedP84Eligible.toLocaleString()} />
        <MetricCard label="Live sends blocked" value={m.liveSendsBlocked.toLocaleString()} />
      </div>
      {preview.excluded.length > 0 ? (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-100">Excluded candidates</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
            {preview.excluded.map((entry) => (
              <li key={entry.candidateId}>
                {entry.candidateName} — {entry.exclusionLabel}: {entry.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.approvalQueue.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Location</th>
                <th className="pb-2 pr-3">Recruiter</th>
                <th className="pb-2 pr-3">Confidence</th>
                <th className="pb-2">P84 after sim</th>
              </tr>
            </thead>
            <tbody>
              {preview.approvalQueue.slice(0, 12).map((entry) => (
                <tr key={entry.candidateId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{entry.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-400">
                    {entry.city ? `${entry.city}, ${entry.state}` : entry.state}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.assignedRecruiter}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.confidence}</td>
                  <td className="py-2 text-zinc-400">
                    {entry.postApprovalSimulation.p84Eligible ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
