"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { BulkImpactPreview, BulkReviewToolsReport } from "@/lib/p111-bulk-mapping-review/types";
import { useCallback, useEffect, useState } from "react";

export function BulkMappingReviewPanel() {
  const [report, setReport] = useState<BulkReviewToolsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkImpactPreview | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/project-mapping/bulk-review", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; bulkReview?: BulkReviewToolsReport; error?: string };
      if (!res.ok || !data.ok || !data.bulkReview) {
        setError(data.error ?? "Failed to load bulk review tools");
        return;
      }
      setReport(data.bulkReview);
    } catch {
      setError("Failed to load bulk review tools");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runPreview = async (groupId: string, action: "approved" | "rejected" | "skipped") => {
    setBusy(groupId);
    setActionError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/project-mapping/bulk-review/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, action, sharedNote: note }),
      });
      const data = (await res.json()) as { ok?: boolean; preview?: BulkImpactPreview; error?: string };
      if (!res.ok || !data.ok || !data.preview) {
        setActionError(data.error ?? "Preview failed");
        return;
      }
      setPreview(data.preview);
    } catch {
      setActionError("Preview failed");
    } finally {
      setBusy(null);
    }
  };

  const applyBulk = async (groupId: string, action: "approved" | "rejected" | "skipped") => {
    setBusy(groupId);
    setActionError(null);
    try {
      const res = await fetch("/api/project-mapping/bulk-review/preview", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, action, sharedNote: note }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? "Bulk action failed");
        return;
      }
      setPreview(null);
      await load();
    } catch {
      setActionError("Bulk action failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <ExecutivePanelLoading title="Bulk Mapping Review" badge="P111" />;
  if (error || !report)
    return <ExecutivePanelError title="Bulk Mapping Review" message={error ?? "No report"} onRetry={load} />;

  const m = report.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Bulk Mapping Review Tools"
        subtitle="P111 — group approve/reject/skip locally; no Breezy writes"
      />
      <p className="mb-4 text-sm text-slate-600">{report.summary}</p>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Groups" value={m.totalGroups.toLocaleString()} />
        <MetricCard label="Bulk-approvable" value={m.bulkApprovableGroups.toLocaleString()} />
        <MetricCard label="Individual only" value={m.individualReviewOnlyGroups.toLocaleString()} />
        <MetricCard label="Est. recoverable" value={m.estimatedCandidatesRecoverable.toLocaleString()} />
      </div>

      <label className="mb-4 block text-sm text-slate-600">
        Shared note for bulk actions
        <textarea
          className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note applied to each candidate in the group…"
        />
      </label>

      <ul className="space-y-3 text-sm">
        {report.topRecommendedBulkApprovals.slice(0, 6).map((group) => (
          <li key={group.groupId} className="rounded border border-slate-200 p-3">
            <div className="font-medium">{group.closedPositionTitle}</div>
            <div className="text-slate-600">→ {group.recommendedPositionTitle ?? "—"}</div>
            <div className="mt-1 text-xs text-slate-500">
              {group.city}, {group.state} · {group.candidateCount} candidates · avg {group.averageConfidence}%
              {group.bulkApprovable ? " · bulk-approvable" : " · individual review only"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === group.groupId || !group.bulkApprovable}
                onClick={() => void runPreview(group.groupId, "approved")}
                className="rounded border px-2 py-1 text-xs disabled:opacity-40"
              >
                Preview approve
              </button>
              <button
                type="button"
                disabled={busy === group.groupId}
                onClick={() => void runPreview(group.groupId, "rejected")}
                className="rounded border px-2 py-1 text-xs"
              >
                Preview reject
              </button>
              <button
                type="button"
                disabled={busy === group.groupId}
                onClick={() => void applyBulk(group.groupId, "approved")}
                className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs disabled:opacity-40"
              >
                Approve group
              </button>
              <button
                type="button"
                disabled={busy === group.groupId}
                onClick={() => void applyBulk(group.groupId, "rejected")}
                className="rounded border px-2 py-1 text-xs"
              >
                Reject group
              </button>
              <button
                type="button"
                disabled={busy === group.groupId}
                onClick={() => void applyBulk(group.groupId, "skipped")}
                className="rounded border px-2 py-1 text-xs"
              >
                Skip group
              </button>
            </div>
          </li>
        ))}
      </ul>

      {preview && (
        <div className="mt-4 rounded border border-blue-200 bg-blue-50/50 p-3 text-sm">
          <div className="font-medium">Dry-run impact preview</div>
          <div>Affected: {preview.candidatesAffected}</div>
          <div>Newly eligible: {preview.newlyEligibleAfterApproval}</div>
          <div>Remaining pending: {preview.remainingPending}</div>
          <div className="text-xs text-slate-600">
            Excluded — sent: {preview.safetyExcluded.alreadySent}, dup: {preview.safetyExcluded.duplicateRisk},
            email: {preview.safetyExcluded.invalidEmail}
          </div>
        </div>
      )}

      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
    </ExecutiveCard>
  );
}
