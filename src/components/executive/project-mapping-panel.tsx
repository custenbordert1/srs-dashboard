"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { ProjectMappingReport } from "@/lib/p108-intelligent-project-mapping/types";
import { useCallback, useEffect, useState } from "react";

export function ProjectMappingPanel() {
  const [report, setReport] = useState<ProjectMappingReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project-mapping", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        projectMapping?: ProjectMappingReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.projectMapping) {
        setError(data.error ?? "Failed to load project mapping report");
        return;
      }
      setReport(data.projectMapping);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load project mapping report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitReview = async (
    item: ProjectMappingReport["reviewQueue"][number],
    action: "approve" | "reject" | "skip",
  ) => {
    setReviewing(item.candidateId);
    setActionError(null);
    try {
      const res = await fetch("/api/project-mapping/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: item.candidateId,
          sourcePositionId: item.currentClosedPosition.positionId,
          recommendedPositionId: item.recommendedPosition.positionId,
          action,
          confidenceScore: item.confidence,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        projectMapping?: ProjectMappingReport;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.projectMapping) {
        setActionError(data.error ?? "Review action failed");
        return;
      }
      setReport(data.projectMapping);
    } catch {
      setActionError("Review action failed");
    } finally {
      setReviewing(null);
    }
  };

  if (loading) return <ExecutivePanelLoading title="Project Mapping Intelligence" badge="P108" />;
  if (error || !report)
    return (
      <ExecutivePanelError title="Project Mapping Intelligence" message={error ?? "No report"} onRetry={load} />
    );

  const m = report.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Project Mapping Intelligence"
        subtitle="P108 — closed-ad recovery recommendations, read-only analysis"
      />
      <p className="mb-4 text-sm text-slate-600">{report.summary}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Evaluated" value={m.closedAdCandidatesEvaluated.toLocaleString()} />
        <MetricCard label="AUTO_MAP" value={m.autoMapCount.toLocaleString()} />
        <MetricCard label="REVIEW" value={m.reviewCount.toLocaleString()} />
        <MetricCard label="NO_MATCH" value={m.noMatchCount.toLocaleString()} />
        <MetricCard label="Avg confidence" value={`${m.averageConfidence}%`} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Recovered" value={m.recoveredApplicants.toLocaleString()} />
        <MetricCard label="Candidates saved" value={m.candidatesSaved.toLocaleString()} />
        <MetricCard label="Review queue" value={report.reviewQueue.length.toLocaleString()} />
        <MetricCard label="MEL demand" value={m.coverageImpact.openMelOpportunitiesInScope.toLocaleString()} />
      </div>

      {report.candidateExamples.highestConfidence.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Highest confidence</h3>
          <ul className="space-y-2 text-sm text-slate-700">
            {report.candidateExamples.highestConfidence.slice(0, 3).map((c) => (
              <li key={c.candidateId} className="rounded border border-slate-200 p-2">
                <div className="font-medium">{c.candidateName}</div>
                <div>{c.explanationHeadline}</div>
                <div className="text-xs text-slate-500">
                  {c.currentClosedPosition.title} → {c.recommendedPositionTitle ?? "—"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.reviewQueue.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Review queue</h3>
          <ul className="space-y-3 text-sm">
            {report.reviewQueue.slice(0, 5).map((item) => (
              <li key={item.candidateId} className="rounded border border-amber-200 bg-amber-50/50 p-3">
                <div className="font-medium">{item.explanationHeadline}</div>
                <div className="mt-1 text-slate-700">
                  {item.currentClosedPosition.title} ({item.currentClosedPosition.city},{" "}
                  {item.currentClosedPosition.state})
                </div>
                <div className="text-slate-600">↓ {item.recommendedPosition.title ?? "—"}</div>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                  {item.explanation.slice(0, 5).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.availableActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={reviewing === item.candidateId}
                      onClick={() => void submitReview(item, action)}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs capitalize hover:bg-slate-50 disabled:opacity-50"
                    >
                      {action}
                    </button>
                  ))}
                  {item.priorDecision && (
                    <span className="text-xs text-slate-500">Prior: {item.priorDecision}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actionError && <p className="mb-2 text-sm text-red-600">{actionError}</p>}
      {warnings.length > 0 && (
        <ul className="list-inside list-disc text-xs text-slate-500">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </ExecutiveCard>
  );
}
