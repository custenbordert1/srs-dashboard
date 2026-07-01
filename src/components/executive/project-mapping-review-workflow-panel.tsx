"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { ReviewWorkflowItem, ReviewWorkflowReport } from "@/lib/p109-project-mapping-review/types";
import { useCallback, useEffect, useState } from "react";

function statusBadge(status: ReviewWorkflowItem["approvalStatus"]): string {
  if (status === "approved") return "bg-green-100 text-green-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  if (status === "skipped") return "bg-slate-100 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

export function ProjectMappingReviewWorkflowPanel() {
  const [report, setReport] = useState<ReviewWorkflowReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notesByCandidate, setNotesByCandidate] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project-mapping/review", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        reviewWorkflow?: ReviewWorkflowReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.reviewWorkflow) {
        setError(data.error ?? "Failed to load review workflow");
        return;
      }
      setReport(data.reviewWorkflow);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load review workflow");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitReview = async (item: ReviewWorkflowItem, action: "approve" | "reject" | "skip") => {
    setReviewing(item.candidateId);
    setActionError(null);
    try {
      const res = await fetch("/api/project-mapping/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: item.candidateId,
          candidateName: item.candidateName,
          closedPositionId: item.closedPosition.positionId,
          recommendedPositionId: item.recommendedPosition.positionId,
          action,
          confidenceScore: item.confidenceScore,
          notes: notesByCandidate[item.candidateId] ?? "",
          mappingReasons: item.mappingReasons,
          mappingDecision: item.mappingDecision,
          factorScores: item.factorScores,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reviewWorkflow?: ReviewWorkflowReport;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.reviewWorkflow) {
        setActionError(data.error ?? "Review action failed");
        return;
      }
      setReport(data.reviewWorkflow);
    } catch {
      setActionError("Review action failed");
    } finally {
      setReviewing(null);
    }
  };

  if (loading) return <ExecutivePanelLoading title="Project Mapping Review" badge="P109" />;
  if (error || !report)
    return (
      <ExecutivePanelError title="Project Mapping Review" message={error ?? "No report"} onRetry={load} />
    );

  const m = report.metrics;
  const pendingQueue = report.reviewQueue.filter((i) => i.approvalStatus === "pending");

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Project Mapping Review Workflow"
        subtitle="P109 — recruiter approvals stored locally; no Breezy writes"
      />
      <p className="mb-4 text-sm text-slate-600">{report.summary}</p>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Review queue" value={m.totalReviewCandidates.toLocaleString()} />
        <MetricCard label="Approved" value={m.approvedCount.toLocaleString()} />
        <MetricCard label="Rejected" value={m.rejectedCount.toLocaleString()} />
        <MetricCard label="Skipped" value={m.skippedCount.toLocaleString()} />
        <MetricCard label="Pending" value={m.pendingCount.toLocaleString()} />
      </div>

      <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <div className="font-semibold text-slate-800">Safety contract</div>
        <ul className="mt-1 list-inside list-disc">
          <li>P106.3 runner unchanged: {report.safetyStatus.p1063RunnerUnchanged ? "yes" : "no"}</li>
          <li>No Breezy writes: {report.safetyStatus.noBreezyWrites ? "yes" : "no"}</li>
          <li>No live sends: {report.safetyStatus.noLiveSends ? "yes" : "no"}</li>
          <li>Unapproved REVIEW blocked: {report.safetyStatus.unapprovedReviewBlocked ? "yes" : "no"}</li>
        </ul>
      </div>

      {pendingQueue.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Pending review ({pendingQueue.length})
          </h3>
          <ul className="space-y-4 text-sm">
            {pendingQueue.slice(0, 8).map((item) => (
              <li key={item.candidateId} className="rounded border border-amber-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{item.candidateName}</div>
                    <div className="text-xs text-slate-500">{item.candidateId}</div>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(item.approvalStatus)}`}>
                    {item.approvalStatus}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded bg-slate-50 p-2">
                    <div className="text-xs font-medium text-slate-500">Closed Breezy position</div>
                    <div>{item.closedPosition.title}</div>
                    <div className="text-xs text-slate-500">
                      {item.closedPosition.city}, {item.closedPosition.state} · {item.closedPosition.breezyStatus}
                    </div>
                  </div>
                  <div className="rounded bg-green-50/50 p-2">
                    <div className="text-xs font-medium text-slate-500">Recommended active position</div>
                    <div>{item.recommendedPosition.title ?? "—"}</div>
                    <div className="text-xs text-slate-500">
                      {item.recommendedPosition.city ?? "—"}, {item.recommendedPosition.state ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <span className="font-medium">{item.confidenceScore}% confidence</span>
                  <span>{item.mappingDecision}</span>
                  <span>{item.explanationHeadline}</span>
                </div>

                <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
                  {item.mappingReasons.slice(0, 6).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>

                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-slate-600">Factor scores</summary>
                  <ul className="mt-1 space-y-1">
                    {item.factorScores.map((f) => (
                      <li key={f.factor} className={f.matched ? "text-green-700" : "text-slate-500"}>
                        {f.detail} ({f.points}/{f.maxPoints})
                      </li>
                    ))}
                  </ul>
                </details>

                <label className="mt-3 block text-xs text-slate-600">
                  Notes
                  <textarea
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                    rows={2}
                    value={notesByCandidate[item.candidateId] ?? item.priorNotes ?? ""}
                    onChange={(e) =>
                      setNotesByCandidate((prev) => ({ ...prev, [item.candidateId]: e.target.value }))
                    }
                    placeholder="Optional recruiter notes…"
                  />
                </label>

                <div className="mt-2 flex flex-wrap gap-2">
                  {item.availableActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={reviewing === item.candidateId}
                      onClick={() => void submitReview(item, action)}
                      className="rounded border border-slate-300 bg-white px-3 py-1 text-xs capitalize hover:bg-slate-50 disabled:opacity-50"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actionError && <p className="mb-2 text-sm text-red-600">{actionError}</p>}
      {warnings.length > 0 && (
        <ul className="list-inside list-disc text-xs text-slate-500">
          {warnings.slice(0, 5).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </ExecutiveCard>
  );
}
