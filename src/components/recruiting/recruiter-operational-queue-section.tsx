"use client";

import type { JobDraft } from "@/lib/job-management/job-draft-types";
import { linkEscalationVariants } from "@/lib/operational-escalation/link-escalation-variants";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import {
  OPERATIONAL_ESCALATION_LABELS,
  RECRUITER_ESCALATION_STATUS_LABELS,
} from "@/lib/operational-escalation/operational-escalation-types";
import {
  buildRecruiterEscalationQueueCounts,
  escalationAgeHours,
  filterRecruiterEscalations,
  listEscalationTerritoryStates,
  type RecruiterEscalationAgingFilter,
  type RecruiterEscalationPriorityFilter,
  type RecruiterEscalationStatusTab,
} from "@/lib/operational-escalation/recruiter-operational-queue-filters";
import { useMemo, useState } from "react";

type RecruiterOperationalQueueSectionProps = {
  items: RecruiterEscalationQueueItem[];
  drafts: JobDraft[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onEditVariant?: (draftId: string) => void;
};

const STATUS_TABS: Array<{ id: RecruiterEscalationStatusTab; label: string }> = [
  { id: "new", label: "New" },
  { id: "in_review", label: "In Review" },
  { id: "completed", label: "Completed" },
  { id: "dismissed", label: "Dismissed" },
];

const PRIORITY_OPTIONS: Array<{ id: RecruiterEscalationPriorityFilter; label: string }> = [
  { id: "all", label: "All priorities" },
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

const AGING_OPTIONS: Array<{ id: RecruiterEscalationAgingFilter; label: string }> = [
  { id: "all", label: "Any age" },
  { id: "24h", label: "24h+" },
  { id: "3d", label: "3d+" },
  { id: "7d+", label: "7d+" },
];

async function patchEscalation(
  id: string,
  body: { status?: RecruiterEscalationStatusTab; note?: string },
): Promise<string | null> {
  const res = await fetch(`/api/recruiting/escalations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as { ok?: boolean; error?: string };
  if (!parsed.ok) return parsed.error ?? "Update failed";
  return null;
}

export function RecruiterOperationalQueueSection({
  items,
  drafts,
  loading,
  onRefresh,
  onEditVariant,
}: RecruiterOperationalQueueSectionProps) {
  const [statusTab, setStatusTab] = useState<RecruiterEscalationStatusTab>("new");
  const [priorityFilter, setPriorityFilter] = useState<RecruiterEscalationPriorityFilter>("all");
  const [territoryState, setTerritoryState] = useState("all");
  const [agingFilter, setAgingFilter] = useState<RecruiterEscalationAgingFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => buildRecruiterEscalationQueueCounts(items), [items]);
  const territoryOptions = useMemo(() => listEscalationTerritoryStates(items), [items]);

  const filtered = useMemo(
    () =>
      filterRecruiterEscalations(items, {
        statusTab,
        priorityFilter,
        territoryState,
        agingFilter,
      }),
    [items, statusTab, priorityFilter, territoryState, agingFilter],
  );

  const selected =
    filtered.find((row) => row.id === selectedId) ??
    items.find((row) => row.id === selectedId) ??
    null;

  const variantSummary = useMemo(
    () => (selected ? linkEscalationVariants(selected, drafts) : null),
    [selected, drafts],
  );

  async function runUpdate(
    id: string,
    body: { status?: RecruiterEscalationStatusTab; note?: string },
  ) {
    setBusy(true);
    setError(null);
    const err = await patchEscalation(id, body);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (body.note) setNoteDraft("");
    await onRefresh();
  }

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-50">Recruiter action queue</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Review DM operational escalations. Manual processing only — no auto repost, pay, or publish.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void onRefresh()}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh queue"}
        </button>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusTab(tab.id)}
            className={tabButtonClass(statusTab === tab.id)}
          >
            {tab.label}
            <span className="ml-1 tabular-nums text-zinc-500">({counts[tab.id]})</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterSelect
          label="Priority"
          value={priorityFilter}
          options={PRIORITY_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
          onChange={(v) => setPriorityFilter(v as RecruiterEscalationPriorityFilter)}
        />
        <FilterSelect
          label="Territory"
          value={territoryState}
          options={[
            { value: "all", label: "All states" },
            ...territoryOptions.map((state) => ({ value: state, label: state })),
          ]}
          onChange={setTerritoryState}
        />
        <FilterSelect
          label="Aging"
          value={agingFilter}
          options={AGING_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
          onChange={(v) => setAgingFilter(v as RecruiterEscalationAgingFilter)}
        />
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-6 text-sm text-zinc-500">
              {loading ? "Loading escalations…" : "No items match these filters."}
            </p>
          ) : (
            filtered.map((item) => (
              <EscalationCard
                key={item.id}
                item={item}
                active={selectedId === item.id}
                onSelect={() => setSelectedId(item.id)}
              />
            ))
          )}
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          {!selected ? (
            <p className="text-sm text-zinc-500">Select an escalation to review and process.</p>
          ) : (
            <EscalationDetail
              item={selected}
              busy={busy}
              noteDraft={noteDraft}
              onNoteChange={setNoteDraft}
              variantSummary={variantSummary}
              onEditVariant={onEditVariant}
              onStatus={(status) => void runUpdate(selected.id, { status })}
              onSaveNote={() => void runUpdate(selected.id, { note: noteDraft })}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function EscalationCard({
  item,
  active,
  onSelect,
}: {
  item: RecruiterEscalationQueueItem;
  active: boolean;
  onSelect: () => void;
}) {
  const ageHours = escalationAgeHours(item);
  const ageLabel =
    ageHours < 24 ? `${Math.max(1, Math.round(ageHours))}h` : `${Math.round(ageHours / 24)}d`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-xl border px-3 py-3 text-left transition",
        active
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-zinc-100">{item.jobTitle}</p>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
          {item.priority ?? "—"}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {item.dmName} · {item.city}, {item.state} · {item.territory}
      </p>
      <p className="mt-1 text-xs text-amber-100/90">
        {OPERATIONAL_ESCALATION_LABELS[item.escalationType]} · {item.alertReason}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {item.recommendedAction} · Open {ageLabel}
        {item.jobAgeDays !== null ? ` · Job age ${item.jobAgeDays}d` : ""}
      </p>
      <p className="mt-1 text-[10px] text-zinc-600">
        {formatWhen(item.createdAt)} · {RECRUITER_ESCALATION_STATUS_LABELS[item.status]}
      </p>
    </button>
  );
}

function EscalationDetail({
  item,
  busy,
  noteDraft,
  onNoteChange,
  variantSummary,
  onEditVariant,
  onStatus,
  onSaveNote,
}: {
  item: RecruiterEscalationQueueItem;
  busy: boolean;
  noteDraft: string;
  onNoteChange: (value: string) => void;
  variantSummary: ReturnType<typeof linkEscalationVariants> | null;
  onEditVariant?: (draftId: string) => void;
  onStatus: (status: RecruiterEscalationStatusTab) => void;
  onSaveNote: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-zinc-100">{item.jobTitle}</h4>
        <p className="mt-1 text-xs text-zinc-500">
          DM {item.dmName} · {item.city}, {item.state} · Job {item.relatedJobId}
        </p>
        <p className="mt-2 text-sm text-zinc-300">{item.recommendedAction}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Type: {OPERATIONAL_ESCALATION_LABELS[item.escalationType]} · Alert: {item.alertReason}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {item.status === "new" ? (
          <ActionChip label="Mark In Review" disabled={busy} onClick={() => onStatus("in_review")} />
        ) : null}
        {item.status !== "completed" && item.status !== "dismissed" ? (
          <>
            <ActionChip label="Complete" disabled={busy} onClick={() => onStatus("completed")} />
            <ActionChip label="Dismiss" disabled={busy} onClick={() => onStatus("dismissed")} />
          </>
        ) : null}
      </div>

      {item.status !== "completed" && item.status !== "dismissed" ? (
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Internal note
          </label>
          <textarea
            value={noteDraft}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
            placeholder="Add recruiter notes for audit history…"
          />
          <button
            type="button"
            disabled={busy || !noteDraft.trim()}
            onClick={onSaveNote}
            className="mt-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Save note
          </button>
        </div>
      ) : null}

      {variantSummary && variantSummary.related.length > 0 ? (
        <VariantRecommendationBlock summary={variantSummary} onEditVariant={onEditVariant} />
      ) : (
        <p className="text-xs text-zinc-600">No linked ad variants for this job yet.</p>
      )}

      <div>
        <h5 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Activity</h5>
        <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
          {[...item.activity].reverse().map((event) => (
            <li key={event.id} className="rounded-lg border border-zinc-800 px-2 py-1.5 text-xs">
              <p className="text-zinc-300">
                {event.actorUserName} ({event.actorRole}) · {event.action}
                {event.fromStatus && event.toStatus
                  ? `: ${event.fromStatus} → ${event.toStatus}`
                  : ""}
              </p>
              {event.note ? <p className="mt-0.5 text-zinc-500">{event.note}</p> : null}
              <p className="mt-0.5 text-zinc-600">{formatWhen(event.at)}</p>
            </li>
          ))}
        </ul>
        {item.internalNotes.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-zinc-500">Saved notes</p>
            <ul className="mt-1 space-y-1 text-xs text-zinc-400">
              {item.internalNotes.map((note, index) => (
                <li key={`${item.id}-note-${index}`}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VariantRecommendationBlock({
  summary,
  onEditVariant,
}: {
  summary: ReturnType<typeof linkEscalationVariants>;
  onEditVariant?: (draftId: string) => void;
}) {
  const sections: Array<{ title: string; rows: typeof summary.pending }> = [
    { title: "Pending variants", rows: summary.pending },
    { title: "Approved (unpublished)", rows: summary.approvedUnpublished },
    { title: "Published variants", rows: summary.published },
    { title: "Nearby city variants", rows: summary.nearbyCity },
  ];

  return (
    <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-3">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-violet-200">
        Related ad variants
      </h5>
      <div className="mt-2 space-y-3">
        {sections.map((section) =>
          section.rows.length === 0 ? null : (
            <div key={section.title}>
              <p className="text-[10px] font-medium uppercase text-zinc-500">{section.title}</p>
              <ul className="mt-1 space-y-1">
                {section.rows.map(({ draft }) => (
                  <li
                    key={draft.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 px-2 py-1 text-xs"
                  >
                    <span className="text-zinc-300">
                      {draft.title} · {draft.variant?.cityTarget}, {draft.usState}
                    </span>
                    {onEditVariant ? (
                      <button
                        type="button"
                        onClick={() => onEditVariant(draft.id)}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800"
                      >
                        Open draft
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      <span className="uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-200"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionChip({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function tabButtonClass(active: boolean): string {
  return [
    "rounded-full border px-3 py-1 text-xs font-medium",
    active
      ? "border-amber-500/40 bg-amber-500/15 text-amber-100"
      : "border-zinc-700 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600",
  ].join(" ");
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
