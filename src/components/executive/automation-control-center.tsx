"use client";

import { ExecutiveDataWarningBanner } from "@/components/executive/executive-data-warning-banner";
import { RoiCategoryBadge, TrustFlagBadge } from "@/components/executive/trust-flag-badge";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import {
  fetchExecutiveIntelligenceRoute,
  scheduleExecutiveBackgroundRefresh,
} from "@/lib/executive-routes/executive-intelligence-client";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import type {
  AutomationControlCenterSnapshot,
  RecruitingAutomationRecord,
} from "@/lib/recruiting-automation-actions";
import type { AutomationRoiView } from "@/lib/executive-trust-roi/types";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState } from "react";

const STATUS_BADGE: Record<string, string> = {
  Draft: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  "Pending Approval": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  Approved: "border-teal-500/30 bg-teal-500/10 text-teal-100",
  Executing: "border-blue-500/30 bg-blue-500/10 text-blue-100",
  Completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  Failed: "border-rose-500/30 bg-rose-500/10 text-rose-100",
  Cancelled: "border-zinc-700 bg-zinc-900/60 text-zinc-500",
};

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className={`${UI_SURFACE.panel} p-4`}>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-50">{value}</p>
    </article>
  );
}

function AutomationTable({
  title,
  rows,
  automationRoiById,
  onSelect,
}: {
  title: string;
  rows: RecruitingAutomationRecord[];
  automationRoiById: Record<string, AutomationRoiView>;
  onSelect: (row: RecruitingAutomationRecord) => void;
}) {
  if (rows.length === 0) {
    return (
      <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
        <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
        <p className="text-sm text-zinc-500">No automations in this category.</p>
      </section>
    );
  }
  return (
    <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
      <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <th className="pb-2 pr-3">Type</th>
              <th className="pb-2 pr-3">Owner</th>
              <th className="pb-2 pr-3">Reason</th>
              <th className="pb-2 pr-3">Impact</th>
              <th className="pb-2 pr-3">Trust</th>
              <th className="pb-2 pr-3">Approval</th>
              <th className="pb-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const roi = automationRoiById[row.id];
              return (
              <tr key={row.id} className="border-b border-zinc-800/60">
                <td className="py-2 pr-3 font-medium text-zinc-200">{row.actionType.replace(/-/g, " ")}</td>
                <td className="py-2 pr-3 text-zinc-400">{row.owner}</td>
                <td className="max-w-[200px] truncate py-2 pr-3 text-zinc-400">{row.reason}</td>
                <td className="py-2 pr-3 text-zinc-400">{row.expectedImpact}</td>
                <td className="py-2 pr-3">
                  {roi ? <TrustFlagBadge flag={roi.trustFlag} /> : <span className="text-zinc-500">—</span>}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[row.approvalStatus] ?? UI_BADGE.moderate}`}
                  >
                    {row.approvalStatus}
                  </span>
                </td>
                <td className="py-2">
                  <button type="button" className={UI_BUTTON.secondary} onClick={() => onSelect(row)}>
                    Details
                  </button>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AutomationDrawer({
  record,
  roi,
  onClose,
  onAction,
  busy,
}: {
  record: RecruitingAutomationRecord;
  roi: AutomationRoiView | null;
  onClose: () => void;
  onAction: (action: string) => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-zinc-500">{record.actionType.replace(/-/g, " ")}</p>
            <h2 className="text-lg font-semibold text-zinc-50">{record.reason}</h2>
          </div>
          <button type="button" className={UI_BUTTON.ghost} onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm text-zinc-300">
          <p>
            <span className="text-zinc-500">Owner ·</span> {record.owner}
          </p>
          <p>
            <span className="text-zinc-500">Expected impact ·</span> {record.expectedImpact}
          </p>
          {roi ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
              <p className="text-xs uppercase text-zinc-500">ROI & trust</p>
              <div className="flex flex-wrap gap-2">
                <TrustFlagBadge flag={roi.trustFlag} />
                <RoiCategoryBadge category={roi.expectedRoi} />
              </div>
              <p className="text-xs text-zinc-400">Confidence {roi.confidenceScore}%</p>
              <p className="text-xs text-zinc-400">
                Projected +{roi.projectedApplicantGain} applicants · +{roi.projectedCoverageGain}% coverage
              </p>
              <p className="text-xs text-zinc-400">Historical success {roi.historicalSuccessRate}%</p>
              {roi.actualResult ? <p className="text-xs text-emerald-200">{roi.actualResult}</p> : null}
              {roi.recommendationAccuracy ? (
                <p className="text-xs text-zinc-500">{roi.recommendationAccuracy}</p>
              ) : null}
              {roi.roiCategory ? (
                <p className="text-xs text-zinc-400">
                  Actual ROI: <RoiCategoryBadge category={roi.roiCategory} />
                </p>
              ) : null}
            </div>
          ) : null}
          <p>
            <span className="text-zinc-500">Approval ·</span> {record.approvalStatus}
          </p>
          {record.sourceRecommendation ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <p className="text-xs uppercase text-zinc-500">Source recommendation</p>
              <p className="mt-1 font-medium text-zinc-200">{record.sourceRecommendation.label}</p>
              <p className="text-xs text-zinc-500">
                {record.sourceRecommendation.source} · {record.sourceRecommendation.recommendationType}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={UI_BUTTON.secondary} disabled={busy} onClick={() => onAction("preview")}>
            Preview
          </button>
          {record.approvalStatus === "Draft" ? (
            <button type="button" className={UI_BUTTON.primary} disabled={busy} onClick={() => onAction("submit")}>
              Submit for approval
            </button>
          ) : null}
          {record.approvalStatus === "Pending Approval" ? (
            <button type="button" className={UI_BUTTON.primary} disabled={busy} onClick={() => onAction("approve")}>
              Approve
            </button>
          ) : null}
          {record.approvalStatus === "Approved" ? (
            <button type="button" className={UI_BUTTON.primary} disabled={busy} onClick={() => onAction("execute")}>
              Execute
            </button>
          ) : null}
          {record.approvalStatus === "Executing" || record.approvalStatus === "Approved" ? (
            <>
              <button
                type="button"
                className={UI_BUTTON.secondary}
                disabled={busy}
                onClick={() => onAction("mark-completed")}
              >
                Mark completed
              </button>
              <button
                type="button"
                className={UI_BUTTON.secondary}
                disabled={busy}
                onClick={() => onAction("mark-failed")}
              >
                Mark failed
              </button>
            </>
          ) : null}
          {record.approvalStatus !== "Completed" && record.approvalStatus !== "Cancelled" ? (
            <button type="button" className={UI_BUTTON.ghost} disabled={busy} onClick={() => onAction("cancel")}>
              Cancel
            </button>
          ) : null}
        </div>

        <section className="mt-6">
          <h3 className={UI_TYPE.sectionTitle}>Execution log</h3>
          {record.auditLog.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No audit entries yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {[...record.auditLog].reverse().map((entry) => (
                <li key={entry.id} className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold uppercase text-zinc-300">{entry.action}</span>
                    <span className="text-zinc-500">{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-zinc-400">{entry.userName}</p>
                  {entry.note ? <p className="mt-1 text-zinc-500">{entry.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

export function AutomationControlCenter() {
  const [snapshot, setSnapshot] = useState<AutomationControlCenterSnapshot | null>(null);
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof fetchExecutiveIntelligenceRoute>>["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RecruitingAutomationRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchExecutiveIntelligenceRoute<AutomationControlCenterSnapshot>(
        "/api/recruiting-automation-actions",
        { force },
      );
      setSnapshot(result.snapshot);
      setMeta(result.meta);
      if (!force) scheduleExecutiveBackgroundRefresh((nextForce) => void load(nextForce), result.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const runAction = async (action: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/recruiting-automation-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, automationId: selected.id }),
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; record?: RecruitingAutomationRecord };
      if (!data.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      if (data.record) setSelected(data.record);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const summary = snapshot?.summary;

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Loading automation control center…"
      emptyTitle="No automation data"
      emptyMessage="Automation drafts appear when autopilot recommendations and candidate recovery signals are available."
      onRefresh={() => void load(true)}
      partialDataAvailable={Boolean(snapshot)}
    >
      {snapshot && summary ? (
        <div id="automation-control-center" className={UI_SPACE.page}>
          <ExecutiveDataWarningBanner meta={meta} onRefresh={() => void load(true)} />

          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Automation Control Center</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Draft, review, approve, and track recruiting automations — approval required by default.
              </p>
            </div>
            {refreshing ? <span className="text-xs text-zinc-500">Refreshing…</span> : null}
          </div>

          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-amber-100">
            Safety mode: <strong>{snapshot.safetyMode}</strong> — no Breezy writes or email sends without approval.
            Live adapters return manual execution required.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Draft" value={summary.draft} />
            <SummaryCard label="Pending approval" value={summary.pendingApproval} />
            <SummaryCard label="Approved" value={summary.approved} />
            <SummaryCard label="Executed this week" value={summary.executedThisWeek} />
            <SummaryCard label="Failed" value={summary.failed} />
          </div>

          <div className="space-y-6">
            <AutomationTable title="Recommended drafts" rows={snapshot.recommended} automationRoiById={snapshot.automationRoiById} onSelect={setSelected} />
            <AutomationTable title="Job refresh drafts" rows={snapshot.jobRefreshDrafts} automationRoiById={snapshot.automationRoiById} onSelect={setSelected} />
            <AutomationTable title="Posting drafts" rows={snapshot.postingDrafts} automationRoiById={snapshot.automationRoiById} onSelect={setSelected} />
            <AutomationTable title="Follow-up campaigns" rows={snapshot.followUpCampaigns} automationRoiById={snapshot.automationRoiById} onSelect={setSelected} />
          </div>

          {selected ? (
            <AutomationDrawer
              record={selected}
              roi={snapshot.automationRoiById[selected.id] ?? null}
              onClose={() => setSelected(null)}
              onAction={runAction}
              busy={busy}
            />
          ) : null}
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
