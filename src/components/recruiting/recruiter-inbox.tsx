"use client";

import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { VirtualCandidateTable } from "@/components/recruiting/virtual-candidate-table";
import {
  buildRecruiterInboxSections,
  RECRUITER_INBOX_THIS_WEEK_SECTIONS,
  RECRUITER_INBOX_TODAY_SECTIONS,
  type RecruiterInboxSectionId,
} from "@/lib/recruiter-action-queue-filters";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

type RecruiterInboxProps = {
  candidates: ScoredCandidateWorkflowRow[];
  actingRecruiter: string;
  scrollToSection?: RecruiterInboxSectionId | null;
  onScrollToSectionHandled?: () => void;
  renderRow: (candidate: ScoredCandidateWorkflowRow) => ReactNode;
  tableHeader: ReactNode;
  colSpan: number;
  /** Everything else — searchable database */
  databaseRows: ScoredCandidateWorkflowRow[];
  search: string;
  onSearchChange: (value: string) => void;
  searchPending?: boolean;
  databaseToolbar?: ReactNode;
};

function sortInboxRows(rows: ScoredCandidateWorkflowRow[]): ScoredCandidateWorkflowRow[] {
  return [...rows].sort(
    (a, b) =>
      b.matchPercent - a.matchPercent ||
      b.ai.numericScore - a.ai.numericScore ||
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  );
}

function InboxSectionBlock({
  sectionId,
  title,
  count,
  rows,
  colSpan,
  tableHeader,
  renderRow,
  maxHeightClass = "max-h-[min(40vh,360px)]",
}: {
  sectionId: RecruiterInboxSectionId;
  title: string;
  count: number;
  rows: ScoredCandidateWorkflowRow[];
  colSpan: number;
  tableHeader: ReactNode;
  renderRow: (candidate: ScoredCandidateWorkflowRow) => ReactNode;
  maxHeightClass?: string;
}) {
  return (
    <section
      id={`inbox-${sectionId}`}
      className="scroll-mt-24 rounded-xl border border-zinc-800/70 bg-zinc-950/30"
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/60 px-3 py-2.5 sm:px-4">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-300">
          {count}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-emerald-300/80 sm:px-4">
          All clear — nothing in this queue.
        </p>
      ) : (
        <VirtualCandidateTable
          rows={rows}
          colSpan={colSpan}
          maxHeightClass={maxHeightClass}
          getRowKey={(candidate) => candidate.candidateId}
          renderRow={(candidate) => renderRow(candidate)}
          header={tableHeader}
        />
      )}
    </section>
  );
}

export function RecruiterInbox({
  candidates,
  actingRecruiter,
  scrollToSection,
  onScrollToSectionHandled,
  renderRow,
  tableHeader,
  colSpan,
  databaseRows,
  search,
  onSearchChange,
  searchPending,
  databaseToolbar,
}: RecruiterInboxProps) {
  const databaseRef = useRef<HTMLElement>(null);

  const sections = useMemo(
    () => buildRecruiterInboxSections(candidates, actingRecruiter),
    [actingRecruiter, candidates],
  );

  const sortedSections = useMemo(
    () => ({
      "overdue-follow-ups": sortInboxRows(sections["overdue-follow-ups"]),
      "paperwork-pending": sortInboxRows(sections["paperwork-pending"]),
      "interview-needed": sortInboxRows(sections["interview-needed"]),
      "ready-for-mel": sortInboxRows(sections["ready-for-mel"]),
      "newly-applied": sortInboxRows(sections["newly-applied"]),
      "everything-else": sortInboxRows(sections["everything-else"]),
    }),
    [sections],
  );

  const sortedDatabaseRows = useMemo(() => sortInboxRows(databaseRows), [databaseRows]);

  useEffect(() => {
    if (!scrollToSection) return;
    const targetId =
      scrollToSection === "everything-else"
        ? "inbox-everything-else"
        : `inbox-${scrollToSection}`;
    const node = document.getElementById(targetId);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      onScrollToSectionHandled?.();
    }
  }, [onScrollToSectionHandled, scrollToSection]);

  const inputClass =
    "w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300/90">Today</p>
          <p className="mt-0.5 text-xs text-zinc-500">Urgent follow-ups and same-day recruiting actions.</p>
        </div>
        <div className="space-y-3">
          {RECRUITER_INBOX_TODAY_SECTIONS.map(({ id, label }) => (
            <InboxSectionBlock
              key={id}
              sectionId={id}
              title={label}
              count={sortedSections[id].length}
              rows={sortedSections[id]}
              colSpan={colSpan}
              tableHeader={tableHeader}
              renderRow={renderRow}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-300/90">This week</p>
          <p className="mt-0.5 text-xs text-zinc-500">Pipeline progress and fresh applicants to work.</p>
        </div>
        <div className="space-y-3">
          {RECRUITER_INBOX_THIS_WEEK_SECTIONS.map(({ id, label }) => (
            <InboxSectionBlock
              key={id}
              sectionId={id}
              title={label}
              count={sortedSections[id].length}
              rows={sortedSections[id]}
              colSpan={colSpan}
              tableHeader={tableHeader}
              renderRow={renderRow}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Everything else</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Search the full candidate database when you need someone outside today&apos;s queues.
          </p>
        </div>
        <section
          id="inbox-everything-else"
          ref={databaseRef}
          className="scroll-mt-24 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
        >
          <div className="sticky top-0 z-20 space-y-2 border-b border-zinc-800/80 bg-zinc-900/95 px-3 py-3 backdrop-blur-sm sm:px-4">
            <input
              className={inputClass}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search name, email, phone, position, or source"
            />
            {searchPending ? <p className="text-[10px] text-zinc-600">Filtering…</p> : null}
            {databaseToolbar}
          </div>
          {sortedDatabaseRows.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-zinc-500 sm:px-4">
              {search.trim()
                ? "No candidates match your search."
                : "No additional candidates outside the action queues."}
            </p>
          ) : (
            <VirtualCandidateTable
              rows={sortedDatabaseRows}
              colSpan={colSpan}
              maxHeightClass="max-h-[min(65vh,720px)]"
              getRowKey={(candidate) => candidate.candidateId}
              renderRow={(candidate) => renderRow(candidate)}
              header={tableHeader}
            />
          )}
        </section>
      </div>
    </div>
  );
}
