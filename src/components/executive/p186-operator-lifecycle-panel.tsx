"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionErrorCard,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import { useP186OperatorQueues } from "@/hooks/use-p186-operator-queues";
import type {
  P1863CandidateDetail,
  P1863CandidateQueueItem,
  P1863OperatorAction,
  P1863QueueId,
} from "@/lib/p186-3-operator-lifecycle-queues/types";
import { useMemo, useState } from "react";

function formatAge(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function DetailDrawer({
  detail,
  onClose,
  onAction,
  busy,
  allowed,
}: {
  detail: P1863CandidateDetail;
  onClose: () => void;
  onAction: (action: P1863OperatorAction, note?: string) => void;
  busy: boolean;
  allowed: P1863OperatorAction[];
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Candidate detail</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-100">{detail.displayName}</h3>
          <p className="text-xs text-zinc-500">{detail.candidateId}</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <dl className="mt-4 space-y-2 text-sm text-zinc-300">
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Job</dt><dd>{detail.jobTitle ?? "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Location</dt><dd>{[detail.city, detail.state].filter(Boolean).join(", ") || "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Recruiter</dt><dd>{detail.recruiter ?? "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">DM</dt><dd>{detail.dm ?? "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Production</dt><dd>{detail.productionState ?? "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">P186 shadow</dt><dd>{detail.shadowState ?? "missing"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Paperwork</dt><dd>{detail.paperworkState ?? "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Onboarding</dt><dd>{detail.onboardingState ?? "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">MEL ready</dt><dd>{detail.melReady ? "yes" : "no"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-zinc-500">Recommended</dt><dd>{detail.recommendedAction}</dd></div>
      </dl>

      {detail.blockers.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">Blockers</p>
          <ul className="mt-1 list-disc pl-4 text-sm text-amber-300">
            {detail.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.missingInformation.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-zinc-500">Missing information</p>
          <p className="mt-1 text-sm text-zinc-400">{detail.missingInformation.join(", ")}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase text-zinc-500">Lifecycle history</p>
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-400">
          {detail.lifecycleHistory.length === 0 ? <li>No shadow history</li> : null}
          {detail.lifecycleHistory.slice(-12).map((h, i) => (
            <li key={`${h.at}-${i}`}>
              {h.at}: {h.from ?? "∅"} → {h.to} ({h.reason})
            </li>
          ))}
        </ul>
      </div>

      {detail.latestSourceEvent ? (
        <p className="mt-3 text-xs text-zinc-500">
          Latest source event: {detail.latestSourceEvent.eventType} @ {detail.latestSourceEvent.at}
        </p>
      ) : null}

      <div className="mt-4">
        <label className="text-xs text-zinc-500">Internal operator note</label>
        <textarea
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-200"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {allowed.includes("add_note") ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200"
            onClick={() => onAction("add_note", note)}
          >
            Add note
          </button>
        ) : null}
        {allowed.includes("approve_hiring_recommendation") ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-200"
            onClick={() => onAction("approve_hiring_recommendation", note)}
          >
            Approve (flagged)
          </button>
        ) : null}
        {allowed.includes("return_to_recruiter") ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-amber-700/60 px-3 py-1.5 text-xs text-amber-200"
            onClick={() => onAction("return_to_recruiter", note)}
          >
            Return for info
          </button>
        ) : null}
        {allowed.includes("place_hold") ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200"
            onClick={() => onAction("place_hold", note)}
          >
            Place hold
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] text-zinc-600">
        Read-only by default. Approval writes only go through production workflow path when
        P186_APPROVAL_ACTIONS is enabled. No paperwork send from this panel.
      </p>
    </div>
  );
}

export function P186OperatorLifecyclePanel() {
  const {
    dashboard,
    enabled,
    warnings,
    loading,
    error,
    detail,
    setDetail,
    preview,
    setPreview,
    actionBusy,
    actionMessage,
    refresh,
    loadDetail,
    runAction,
  } = useP186OperatorQueues();

  const [selectedQueue, setSelectedQueue] = useState<P1863QueueId | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const items = useMemo(() => {
    if (!dashboard) return [] as P1863CandidateQueueItem[];
    let list = dashboard.items;
    if (selectedQueue !== "all") list = list.filter((i) => i.queueId === selectedQueue);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.candidateId.toLowerCase().includes(q) ||
          (i.recruiter ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [dashboard, selectedQueue, search]);

  if (loading) {
    return <SectionLoadingCard title="P186 Operator Lifecycle" badge="P186.3" />;
  }

  if (error) {
    return (
      <SectionErrorCard
        title="P186 Operator Lifecycle"
        badge="P186.3"
        message={error}
        onRetry={() => void refresh()}
      />
    );
  }

  if (!enabled || !dashboard) {
    return (
      <ExecutiveCard>
        <SectionHeader
          title="P186 Operator Lifecycle"
          subtitle="Shadow-backed queues — flag off (idle). Production remains source of truth."
          badge="P186.3"
        />
        <p className="mt-3 text-sm text-zinc-400">
          Enable with <code className="text-zinc-300">P186_OPERATOR_DASHBOARD=1</code>. Approval and
          bulk actions remain separately gated and default off.
        </p>
        {warnings.length > 0 ? (
          <div className="mt-3">
            <SectionDegradedBanner message={warnings.join(" · ")} />
          </div>
        ) : null}
      </ExecutiveCard>
    );
  }

  const allowed = dashboard.allowedActions;
  const health = dashboard.health;

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="P186 Operator Lifecycle"
          subtitle="Observation-first queues from shadow data. Approvals write only via production workflow path."
          badge="P186.3"
        />
        <div className="flex flex-wrap items-center gap-2">
          <LastUpdatedBadge at={dashboard.generatedAt} />
          <StatusBadge tone="neutral">read-only default</StatusBadge>
          <StatusBadge tone="success">P184/P185 isolated</StatusBadge>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-4">
          <SectionDegradedBanner message={warnings.join(" · ")} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Items" value={String(dashboard.items.length)} />
        <MetricCard label="Mismatches" value={String(health.lifecycleMismatchCount)} />
        <MetricCard label="Missing shadow" value={String(health.missingShadowCount)} />
        <MetricCard label="Blocked" value={String(health.blockedActionCount)} />
        <MetricCard
          label="Approval aging"
          value={formatAge(health.approvalAgingMs.oldest)}
        />
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setSelectedQueue("all")}
          className={`rounded-xl border p-3 text-left ${
            selectedQueue === "all" ? "border-zinc-500 bg-zinc-900" : "border-zinc-800"
          }`}
        >
          <p className="text-xs text-zinc-500">All visible queues</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{dashboard.items.length}</p>
        </button>
        {dashboard.queues
          .filter((q) => q.count > 0)
          .map((q) => (
            <button
              key={q.queueId}
              type="button"
              onClick={() => setSelectedQueue(q.queueId)}
              className={`rounded-xl border p-3 text-left ${
                selectedQueue === q.queueId ? "border-zinc-500 bg-zinc-900" : "border-zinc-800"
              }`}
            >
              <p className="text-xs text-zinc-500">{q.label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">{q.count}</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                oldest {formatAge(q.oldestAgeMs)} · avg {formatAge(q.averageAgeMs)} · blocked{" "}
                {q.blockedCount} · priority {q.priorityCount}
              </p>
            </button>
          ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          placeholder="Search name, id, recruiter"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          disabled={actionBusy || selected.size === 0}
          className="rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-200 disabled:opacity-40"
          onClick={() =>
            void runAction({
              action: "approve_hiring_recommendation",
              candidateIds: [...selected],
              mode: "preview",
            })
          }
        >
          Preview approve selected
        </button>
        <button
          type="button"
          disabled={actionBusy || selected.size === 0}
          className="rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-200 disabled:opacity-40"
          onClick={() =>
            void runAction({
              action: "export_redacted",
              candidateIds: [...selected],
            })
          }
        >
          Export redacted
        </button>
      </div>

      {actionMessage ? (
        <p className="mt-3 text-sm text-zinc-400">{actionMessage}</p>
      ) : null}

      {preview ? (
        <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
          <p className="text-sm font-medium text-zinc-200">
            Bulk preview: {preview.action} — eligible {preview.eligible.length}, blocked{" "}
            {preview.blocked.length}
            {preview.truncated ? ` (truncated to ${preview.batchLimit})` : ""}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={actionBusy}
              className="rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs text-emerald-200"
              onClick={() =>
                void runAction({
                  action: preview.action,
                  candidateIds: preview.eligible.map((e) => e.candidateId),
                  confirmed: true,
                  mode: "execute",
                }).then(() => setPreview(null))
              }
            >
              Confirm execute
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300"
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-2 py-2">Sel</th>
              <th className="px-2 py-2">Candidate</th>
              <th className="px-2 py-2">Ownership</th>
              <th className="px-2 py-2">Production</th>
              <th className="px-2 py-2">Shadow</th>
              <th className="px-2 py-2">Age</th>
              <th className="px-2 py-2">Mismatch</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 100).map((item) => (
              <tr key={item.candidateId} className="border-t border-zinc-800/80 text-zinc-300">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(item.candidateId)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(item.candidateId);
                        else next.delete(item.candidateId);
                        return next;
                      });
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    className="text-left text-zinc-100 underline-offset-2 hover:underline"
                    onClick={() => void loadDetail(item.candidateId)}
                  >
                    {item.displayName}
                  </button>
                  <div className="text-[11px] text-zinc-500">{item.jobTitle ?? "—"}</div>
                </td>
                <td className="px-2 py-2 text-xs">
                  R: {item.recruiter ?? "—"}
                  <br />
                  DM: {item.dm ?? "—"}
                </td>
                <td className="px-2 py-2">{item.productionState ?? "—"}</td>
                <td className="px-2 py-2">{item.shadowState ?? "missing"}</td>
                <td className="px-2 py-2">{formatAge(item.ageMs)}</td>
                <td className="px-2 py-2">
                  {item.mismatch ? item.mismatchKind ?? "yes" : "ok"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No candidates in this queue view.</p>
        ) : null}
      </div>

      {detail ? (
        <DetailDrawer
          detail={detail}
          onClose={() => setDetail(null)}
          busy={actionBusy}
          allowed={allowed}
          onAction={(action, note) => {
            void runAction({
              action,
              candidateIds: [detail.candidateId],
              note,
              confirmed: true,
              mode: "execute",
            });
          }}
        />
      ) : null}
    </ExecutiveCard>
  );
}
