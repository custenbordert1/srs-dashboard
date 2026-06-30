"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { BreezyJobPublishReviewReport } from "@/lib/breezy-job-publish-review";
import { useCallback, useEffect, useState } from "react";

export function BreezyJobPublishReviewPanel() {
  const [review, setReview] = useState<BreezyJobPublishReviewReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/breezy-job-publish-review?includeEntries=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        review?: BreezyJobPublishReviewReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.review) {
        setError(data.error ?? "Failed to load Breezy job publish review");
        return;
      }
      setReview(data.review);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load Breezy job publish review");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !review) {
    return <ExecutivePanelLoading title="Breezy Job Publish Review" badge="P91 Preview" />;
  }

  if (error) {
    return (
      <ExecutivePanelError
        title="Breezy Job Publish Review"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!review) return null;

  const m = review.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title={review.sectionTitle}
        subtitle="Preview-only publish/reactivate review for P84 unlock jobs. No automatic Breezy writes."
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Jobs needing publish" value={m.jobsNeedingPublish.toLocaleString()} />
        <MetricCard label="Safe to publish" value={m.safeToPublish.toLocaleString()} />
        <MetricCard label="Duplicate conflict" value={m.duplicateConflict.toLocaleString()} />
        <MetricCard label="Should remain closed" value={m.shouldRemainClosed.toLocaleString()} />
        <MetricCard label="Needs human review" value={m.needsHumanReview.toLocaleString()} />
        <MetricCard
          label="Candidates unlocked if approved"
          value={m.candidatesUnlockedIfApproved.toLocaleString()}
        />
      </div>
      {review.duplicateFindings.length > 0 ? (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-100">Duplicate / old ad findings</p>
          <ul className="mt-2 space-y-2 text-xs text-amber-100/90">
            {review.duplicateFindings.slice(0, 5).map((finding) => (
              <li key={finding.activeJobId}>
                Keep <span className="font-mono">{finding.recommendedKeepActiveJobId}</span> active; retire{" "}
                {finding.duplicateJobIds.join(", ")} — {finding.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {review.entries.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Job</th>
                <th className="pb-2 pr-3">Location</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Blocked</th>
                <th className="pb-2 pr-3">Recommendation</th>
                <th className="pb-2">Risk</th>
              </tr>
            </thead>
            <tbody>
              {review.entries.slice(0, 12).map((entry) => (
                <tr key={entry.positionId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{entry.jobTitle}</td>
                  <td className="py-2 pr-3 text-zinc-400">
                    {entry.city ? `${entry.city}, ${entry.state}` : entry.state}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.currentBreezyStatus}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.blockedCandidateCount}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.recommendationLabel}</td>
                  <td className="py-2 text-zinc-400">{entry.riskLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
