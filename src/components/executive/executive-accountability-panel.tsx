"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  useExecutiveAccountability,
  type ExecutiveActionUpdateInput,
} from "@/hooks/use-executive-accountability";
import type {
  ExecutiveActionAuditEntry,
  ExecutiveActionStatus,
  ExecutiveTrackedAction,
  OperationalEvidenceKind,
} from "@/lib/executive-accountability/types";
import {
  evidenceKindForRecommendationKind,
  OPERATIONAL_EVIDENCE_LABELS,
} from "@/lib/executive-accountability/action-audit";
import {
  accountabilityExecutionLinksForKind,
} from "@/lib/executive-accountability/execution-links";
import type { RecommendationPriority } from "@/lib/executive-recruiting-forecast";
import { forecastConfidenceLabel } from "@/lib/executive-recruiting-forecast";
import { ExecutiveAuditCenterView } from "@/components/executive/executive-audit-center-view";
import { ExecutiveOverdueEscalationView } from "@/components/executive/executive-overdue-escalation-view";
import { ExecutiveWeeklyPacketView } from "@/components/executive/executive-weekly-packet-view";
import { TabSkeleton } from "@/components/ui/tab-skeleton";

type AccountabilityView = "packet" | "board" | "audit" | "overdue";

const VIEW_TABS: { id: AccountabilityView; label: string }[] = [
  { id: "packet", label: "Executive Packet" },
  { id: "board", label: "Action Board" },
  { id: "audit", label: "Executive Audit" },
  { id: "overdue", label: "Overdue Escalation" },
];

function parseAccountabilityView(value: string | null): AccountabilityView {
  if (value === "board" || value === "audit" || value === "overdue" || value === "packet") {
    return value;
  }
  return "packet";
}

const PRIORITY_STYLES: Record<RecommendationPriority, { border: string; badge: string }> = {
  critical: { border: "border-red-500/50", badge: "bg-red-500/20 text-red-100" },
  high: { border: "border-amber-500/40", badge: "bg-amber-500/15 text-amber-100" },
  medium: { border: "border-yellow-500/30", badge: "bg-yellow-500/10 text-yellow-100" },
  low: { border: "border-zinc-700", badge: "bg-zinc-800/80 text-zinc-300" },
};

const STATUS_LABELS: Record<ExecutiveActionStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  dismissed: "Dismissed",
  archived: "Archived",
};

const EVIDENCE_KINDS: OperationalEvidenceKind[] = [
  "candidate_moved",
  "job_refreshed",
  "pay_increased",
  "territory_escalated",
];

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function formatDueDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toDateInputValue(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function AuditTrail({ entries }: { entries: ExecutiveActionAuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="mt-2 text-xs text-zinc-600">No audit history yet.</p>;
  }
  return (
    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-500">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className="text-zinc-400">{new Date(entry.changedAt).toLocaleString()}</span>
          {" · "}
          <span className="text-zinc-300">{entry.changedBy}</span>
          {" changed "}
          <span className="text-zinc-300">{entry.field}</span>
          {entry.oldValue !== null ? (
            <>
              {" "}
              from <span className="text-zinc-400">{entry.oldValue}</span>
            </>
          ) : null}
          {" to "}
          <span className="text-zinc-200">{entry.newValue ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionRow({
  action,
  overdue,
  auditEntries,
  onUpdate,
  updating,
  editable,
}: {
  action: ExecutiveTrackedAction;
  overdue: boolean;
  auditEntries: ExecutiveActionAuditEntry[];
  onUpdate: (input: ExecutiveActionUpdateInput) => void;
  updating: boolean;
  editable: boolean;
}) {
  const style = PRIORITY_STYLES[action.priority];
  const [owner, setOwner] = useState(action.owner ?? "");
  const [dueDate, setDueDate] = useState(toDateInputValue(action.dueDate));
  const [outcomeNotes, setOutcomeNotes] = useState(action.outcomeNotes ?? "");
  const [showAudit, setShowAudit] = useState(false);
  const suggestedEvidence = evidenceKindForRecommendationKind(action.recommendationKind);

  const saveOwner = () => {
    void onUpdate({
      recommendationId: action.recommendationId,
      owner: owner.trim() || null,
    });
  };

  const saveDueDate = () => {
    if (!dueDate) return;
    void onUpdate({
      recommendationId: action.recommendationId,
      dueDate: new Date(`${dueDate}T12:00:00.000Z`).toISOString(),
    });
  };

  const saveOutcome = () => {
    void onUpdate({
      recommendationId: action.recommendationId,
      outcomeNotes: outcomeNotes.trim() || null,
    });
  };

  return (
    <li className={`rounded-lg border px-3 py-3 ${style.border} ${overdue ? "ring-1 ring-red-500/30" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-100">{action.title}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {action.owner ?? "Unassigned"} · Due {formatDueDate(action.dueDate)}
            {overdue ? <span className="ml-2 text-red-300">Overdue</span> : null}
            {action.status === "archived" ? (
              <span className="ml-2 text-zinc-400">Archived</span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-zinc-400">{action.expectedImpact}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${style.badge}`}>
          {action.priority}
        </span>
      </div>

      {action.operationalEvidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {action.operationalEvidence.map((row) => (
            <span
              key={row.id}
              className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-100"
            >
              {row.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1">
        {accountabilityExecutionLinksForKind(action.recommendationKind ?? undefined).map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-teal-500/40 hover:text-teal-100"
          >
            {link.label}
          </Link>
        ))}
      </div>

      {action.outcomeNotes ? (
        <p className="mt-2 text-xs text-zinc-300">
          <span className="text-zinc-500">Outcome: </span>
          {action.outcomeNotes}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">{STATUS_LABELS[action.status]}</span>
        {editable && (action.status === "open" || action.status === "in_progress") ? (
          <>
            {action.status === "open" ? (
              <button
                type="button"
                disabled={updating}
                onClick={() => onUpdate({ recommendationId: action.recommendationId, status: "in_progress" })}
                className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Start
              </button>
            ) : null}
            <button
              type="button"
              disabled={updating}
              onClick={() => onUpdate({ recommendationId: action.recommendationId, status: "completed" })}
              className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              Complete
            </button>
            <button
              type="button"
              disabled={updating}
              onClick={() => onUpdate({ recommendationId: action.recommendationId, status: "dismissed" })}
              className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
            >
              Dismiss
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setShowAudit((value) => !value)}
          className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800"
        >
          {showAudit ? "Hide audit" : "Audit trail"}
        </button>
      </div>

      {editable && (action.status === "open" || action.status === "in_progress") ? (
        <div className="mt-3 grid gap-2 border-t border-zinc-800/80 pt-3 sm:grid-cols-2">
          <label className="block text-xs text-zinc-500">
            Owner
            <div className="mt-1 flex gap-1">
              <input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                placeholder="Assign owner"
              />
              <button
                type="button"
                disabled={updating}
                onClick={saveOwner}
                className="shrink-0 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Save
              </button>
            </div>
          </label>
          <label className="block text-xs text-zinc-500">
            Due date
            <div className="mt-1 flex gap-1">
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
              />
              <button
                type="button"
                disabled={updating}
                onClick={saveDueDate}
                className="shrink-0 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Save
              </button>
            </div>
          </label>
          <label className="block text-xs text-zinc-500 sm:col-span-2">
            Outcome notes
            <div className="mt-1 flex gap-1">
              <textarea
                value={outcomeNotes}
                onChange={(event) => setOutcomeNotes(event.target.value)}
                rows={2}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
                placeholder="What happened when this action was addressed?"
              />
              <button
                type="button"
                disabled={updating}
                onClick={saveOutcome}
                className="shrink-0 self-start rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Save
              </button>
            </div>
          </label>
          <div className="sm:col-span-2">
            <p className="text-xs text-zinc-500">Operational evidence</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {EVIDENCE_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={updating}
                  onClick={() =>
                    onUpdate({
                      recommendationId: action.recommendationId,
                      operationalEvidenceKind: kind,
                    })
                  }
                  className={`rounded border px-2 py-0.5 text-[10px] ${
                    suggestedEvidence === kind
                      ? "border-teal-500/40 bg-teal-500/10 text-teal-100"
                      : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {OPERATIONAL_EVIDENCE_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showAudit ? <AuditTrail entries={auditEntries} /> : null}
    </li>
  );
}

export function ExecutiveAccountabilityPanel() {
  const [view, setView] = useState<AccountabilityView>("packet");
  const { snapshot, loading, error, timedOut, refresh, updateAction, updatingId } =
    useExecutiveAccountability();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setView(parseAccountabilityView(params.get("view")));
  }, []);

  function selectView(next: AccountabilityView) {
    setView(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "executive-accountability");
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  if (loading && !snapshot) {
    return <TabSkeleton message="Loading executive accountability…" cards={4} rows={5} />;
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-6 text-sm text-red-100">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium hover:bg-red-500/20"
        >
          {timedOut ? "Retry" : "Refresh"}
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-400">
        Accountability data is not available yet.
      </div>
    );
  }

  const rhythm = snapshot.operatingRhythm;
  const overdueIds = new Set(snapshot.overdueActions.map((row) => row.recommendationId));
  const openActions = snapshot.activeActions;
  const historyActions = snapshot.actions.filter(
    (row) =>
      row.status === "completed" ||
      row.status === "dismissed" ||
      row.status === "archived",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Executive Accountability</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Weekly operating rhythm for P44 forecast accountability
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/?tab=executive-forecasting"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Back to Forecast
          </Link>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 print:hidden">
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 lg:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-200/80">
            Overdue actions
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-red-50">
            {rhythm.overdueEscalation.totalOverdue}
          </p>
          <p className="mt-1 text-xs text-red-200/70">
            {snapshot.statusSummary.overdue} total past due · escalation buckets from 3+ days
          </p>
        </div>
        <KpiCard label="Open" value={snapshot.statusSummary.open} />
        <KpiCard label="Completed this week" value={snapshot.weeklySummary.completed} />
        <KpiCard label="Opened this week" value={snapshot.weeklySummary.opened} />
        <KpiCard
          label="Completion rate"
          value={`${snapshot.statusSummary.completionRate}%`}
        />
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-zinc-800 print:hidden">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectView(tab.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              view === tab.id
                ? "border border-b-0 border-zinc-700 bg-zinc-900/80 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {view === "packet" ? (
        <ExecutiveWeeklyPacketView
          packet={rhythm.weeklyPacket}
          emailMarkdown={rhythm.emailMarkdown}
        />
      ) : null}

      {view === "audit" ? (
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Executive audit center</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Reconstruct accountability changes without opening individual action cards.
          </p>
          <div className="mt-4">
            <ExecutiveAuditCenterView rows={rhythm.auditCenter} />
          </div>
        </section>
      ) : null}

      {view === "overdue" ? (
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Overdue escalation dashboard</h3>
          <div className="mt-4">
            <ExecutiveOverdueEscalationView dashboard={rhythm.overdueEscalation} />
          </div>
        </section>
      ) : null}

      {view === "board" ? (
        <>
      <section className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 px-4 py-4">
        <h3 className="text-sm font-semibold text-zinc-200">Weekly executive summary</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <KpiCard label="Opened this week" value={snapshot.weeklySummary.opened} />
          <KpiCard label="Completed" value={snapshot.weeklySummary.completed} />
          <KpiCard label="Overdue now" value={snapshot.weeklySummary.overdue} />
          <KpiCard label="Archived" value={snapshot.weeklySummary.archived} />
          <KpiCard label="Total history" value={snapshot.statusSummary.total} hint="Permanent record" />
        </div>
        {snapshot.weeklySummary.topBlockers.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top blockers</p>
            <ul className="mt-1 space-y-1 text-sm text-zinc-300">
              {snapshot.weeklySummary.topBlockers.map((title) => (
                <li key={title}>· {title}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No critical/high blockers in the active queue.</p>
        )}
      </section>

      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 px-4 py-4">
        <p className="text-sm font-medium text-zinc-100">{snapshot.weeklyNarrative.headline}</p>
        <ul className="mt-3 space-y-1 text-sm text-zinc-400">
          {snapshot.weeklyNarrative.whatChanged.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Active action board</h3>
          {openActions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No open executive actions.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {openActions.slice(0, 12).map((action) => (
                <ActionRow
                  key={action.recommendationId}
                  action={action}
                  overdue={overdueIds.has(action.recommendationId)}
                  auditEntries={snapshot.auditByActionId[action.recommendationId] ?? []}
                  updating={updatingId === action.recommendationId}
                  onUpdate={updateAction}
                  editable
                />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">By owner</h3>
          {snapshot.ownerGroups.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No owners assigned yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {snapshot.ownerGroups.map((group) => (
                <li
                  key={group.owner}
                  className="flex items-center justify-between rounded-lg border border-zinc-800/80 px-3 py-2"
                >
                  <span className="font-medium text-zinc-200">{group.owner}</span>
                  <span className="text-xs text-zinc-500">
                    {group.open} open · {group.inProgress} in progress
                    {group.overdue > 0 ? (
                      <span className="ml-1 text-red-300">· {group.overdue} overdue</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Permanent history</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Completed, dismissed, and archived actions are never removed.
        </p>
        {historyActions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No historical actions yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {historyActions.slice(0, 15).map((action) => (
              <ActionRow
                key={action.recommendationId}
                action={action}
                overdue={false}
                auditEntries={snapshot.auditByActionId[action.recommendationId] ?? []}
                updating={updatingId === action.recommendationId}
                onUpdate={updateAction}
                editable={false}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Forecast vs actual (early backtest)</h3>
        <p className="mt-1 text-xs text-zinc-500">{snapshot.forecastBacktest.message}</p>
        {snapshot.forecastBacktest.rows.length === 0 ? (
          <p className="mt-3 text-sm text-amber-200/90">Not enough history yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                  <th className="pb-2 pr-3">Captured</th>
                  <th className="pb-2 pr-3">Projected 30d</th>
                  <th className="pb-2 pr-3">Actual proxy</th>
                  <th className="pb-2 pr-3">Delta</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.forecastBacktest.rows.map((row) => (
                  <tr key={row.historyId} className="border-b border-zinc-800/60">
                    <td className="py-2 pr-3 text-zinc-400">
                      {new Date(row.capturedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-200">{row.projectedHires30}</td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-300">
                      {row.actualActiveRepCount ?? "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-300">
                      {row.deltaFromProjection ?? "—"}
                    </td>
                    <td className="py-2 text-xs text-zinc-500">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-600">
          Model confidence: {forecastConfidenceLabel(snapshot.forecast.forecastConfidence)} — separate from data trust.
        </p>
      </section>
        </>
      ) : null}
    </div>
  );
}
