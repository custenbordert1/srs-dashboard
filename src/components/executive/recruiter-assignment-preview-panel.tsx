"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { P62AssignmentPreviewReport } from "@/lib/p62-assignment-preview";
import { useCallback, useEffect, useState } from "react";

export function RecruiterAssignmentPreviewPanel() {
  const [preview, setPreview] = useState<P62AssignmentPreviewReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/p62-assignment-preview?includeEntries=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        preview?: P62AssignmentPreviewReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.preview) {
        setError(data.error ?? "Failed to load recruiter assignment preview");
        return;
      }
      setPreview(data.preview);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load recruiter assignment preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !preview) {
    return <ExecutivePanelLoading title="Recruiter Assignment Preview" badge="P94 Preview" />;
  }

  if (error) {
    return (
      <ExecutivePanelError
        title="Recruiter Assignment Preview"
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
        subtitle={`${preview.cohortLabel}. Preview-only — no workflow writes or live sends.`}
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Candidates reviewed" value={m.candidatesReviewed.toLocaleString()} />
        <MetricCard label="Assignable" value={m.candidatesAssignable.toLocaleString()} />
        <MetricCard label="Needs human review" value={m.candidatesNeedingHumanReview.toLocaleString()} />
        <MetricCard
          label="Expected Paperwork Needed"
          value={m.candidatesExpectedPaperworkNeeded.toLocaleString()}
        />
        <MetricCard
          label="Expected P84 eligible"
          value={m.candidatesExpectedP84Eligible.toLocaleString()}
        />
        <MetricCard
          label="Still blocked after sim"
          value={m.candidatesStillBlockedAfterAssignment.toLocaleString()}
        />
      </div>
      {preview.recruiterDistribution.length > 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-sm font-medium text-zinc-200">Recommended recruiter distribution</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            {preview.recruiterDistribution.map((entry) => (
              <li key={entry.recruiter}>
                {entry.recruiter}: {entry.candidateCount} candidate{entry.candidateCount === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.entries.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Job</th>
                <th className="pb-2 pr-3">Recruiter</th>
                <th className="pb-2 pr-3">Outcome</th>
                <th className="pb-2">P84 after sim</th>
              </tr>
            </thead>
            <tbody>
              {preview.entries.slice(0, 12).map((entry) => (
                <tr key={entry.candidateId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{entry.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-400">
                    {entry.city ? `${entry.city}, ${entry.state}` : entry.state}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.recommendedRecruiter}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.outcome}</td>
                  <td className="py-2 text-zinc-400">
                    {entry.downstream.p84EligibleAfterSimulation ? "Yes" : "No"}
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
