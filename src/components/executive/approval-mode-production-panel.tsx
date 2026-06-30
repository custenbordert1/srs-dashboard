"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { ApprovalModeProductionReport } from "@/lib/approval-mode-production";
import { useCallback, useEffect, useState } from "react";

export function ApprovalModeProductionPanel() {
  const [production, setProduction] = useState<ApprovalModeProductionReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/approval-mode-production?includeQueue=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        production?: ApprovalModeProductionReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.production) {
        setError(data.error ?? "Failed to load approval mode production");
        return;
      }
      setProduction(data.production);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load approval mode production");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !production) {
    return <ExecutivePanelLoading title="Approval Mode Production" badge="P97" />;
  }

  if (error) {
    return (
      <ExecutivePanelError
        title="Approval Mode Production"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!production) return null;

  const m = production.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title={production.sectionTitle}
        subtitle={`${production.cohortLabel}. Persist via POST only — no auto-approval, no sends.`}
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Pending approvals" value={m.pendingApprovals.toLocaleString()} />
        <MetricCard label="Persisted" value={m.persisted.toLocaleString()} />
        <MetricCard label="Rollback available" value={m.rollbackAvailable.toLocaleString()} />
        <MetricCard
          label="P84 eligible after persist"
          value={m.p84EligibleAfterPersistence.toLocaleString()}
        />
        <MetricCard label="Live sends blocked" value={m.liveSendsBlocked.toLocaleString()} />
        <MetricCard label="Approved" value={m.approved.toLocaleString()} />
      </div>
      {production.queue.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Recruiter</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">P84 after persist</th>
              </tr>
            </thead>
            <tbody>
              {production.queue.slice(0, 12).map((entry) => (
                <tr key={entry.candidateId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{entry.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.recruiter}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.status}</td>
                  <td className="py-2 text-zinc-400">
                    {entry.p84EligibleAfterPersistence == null
                      ? "—"
                      : entry.p84EligibleAfterPersistence
                        ? "Yes"
                        : "No"}
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
