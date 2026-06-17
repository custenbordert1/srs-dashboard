"use client";

import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import {
  BOTTLENECK_BADGE_LABELS,
  ONE_CLICK_ACTION_LABELS,
  QUEUE_SECTION_LABELS,
  SMART_FILTERS,
  buildRecruiterActionCenterFromRows,
  countSmartFilterMatches,
  mapOneClickActionToWorkflowUpdate,
  priorityBandLabel,
  queuePayloadFromOneClick,
  recruiterScoreLevelLabel,
  type RecruiterOneClickActionId,
  type SmartFilterId,
} from "@/lib/recruiter-action-center";
import {
  RECRUITER_ACTION_CENTER_ELEMENT_IDS,
  type RecruiterActionCenterDeepLink,
} from "@/lib/recruiting-tab-navigation";
import type { RecruiterHomeMode } from "@/lib/guided-recruiting-workflow";
import { useCallback, useEffect, useMemo, useState } from "react";

type RecruiterActionCenterPanelProps = {
  candidates: ScoredCandidateWorkflowRow[];
  opportunities: MelOpportunity[];
  actingRecruiter: string;
  recruiters: string[];
  showTeamLeaderView?: boolean;
  homeMode: RecruiterHomeMode;
  onHomeModeChange: (mode: RecruiterHomeMode) => void;
  onActingRecruiterChange: (name: string) => void;
  onOpenCandidate: (candidateId: string) => void;
  onQueueAction: (candidateId: string, payload: CandidateQueueActionPayload) => void;
  onWorkflowStatus?: (candidateId: string, status: string) => void;
  onAssignRecruiter?: (candidateId: string, recruiter: string) => void;
  onRecruitingAction?: (candidateId: string, type: "priority-list" | "needs-follow-up", enabled?: boolean) => void;
  onAddNote?: (candidateId: string, note: string) => void;
  actionBusy?: boolean;
  initialFilter?: SmartFilterId | null;
  deepLink?: RecruiterActionCenterDeepLink | null;
  syncPartial?: boolean;
  syncStale?: boolean;
};

const PRIORITY_BAND_STYLES = {
  "work-immediately": "border-red-500/40 bg-red-500/10 text-red-100",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  normal: "border-zinc-600 bg-zinc-800/40 text-zinc-200",
  monitor: "border-zinc-700 bg-zinc-900/40 text-zinc-400",
} as const;

function KpiCard({
  label,
  value,
  goal,
  tone,
}: {
  label: string;
  value: number;
  goal?: number;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-200" : tone === "ok" ? "text-teal-200" : "text-zinc-50"
        }`}
      >
        {value}
        {goal != null ? <span className="text-sm font-normal text-zinc-500"> / {goal}</span> : null}
      </p>
    </div>
  );
}

export function RecruiterActionCenterPanel({
  candidates,
  opportunities,
  actingRecruiter,
  recruiters,
  showTeamLeaderView = false,
  homeMode,
  onHomeModeChange,
  onActingRecruiterChange,
  onOpenCandidate,
  onQueueAction,
  onWorkflowStatus,
  onAssignRecruiter,
  onRecruitingAction,
  onAddNote,
  actionBusy = false,
  initialFilter = null,
  deepLink = null,
  syncPartial,
  syncStale,
}: RecruiterActionCenterPanelProps) {
  const [activeFilter, setActiveFilter] = useState<SmartFilterId | null>(initialFilter);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [expandedQueue, setExpandedQueue] = useState<string | null>("work-now");
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  const [prevDeepLinkSig, setPrevDeepLinkSig] = useState<string | null>(null);

  if (initialFilter !== prevInitialFilter) {
    setPrevInitialFilter(initialFilter);
    if (initialFilter) setActiveFilter(initialFilter);
  }

  const deepLinkSig = deepLink ? JSON.stringify(deepLink) : null;
  if (deepLinkSig !== prevDeepLinkSig) {
    setPrevDeepLinkSig(deepLinkSig);
    if (deepLink?.kind === "queue") {
      if (deepLink.queue === "work-now") setExpandedQueue("work-now");
      if (deepLink.queue === "paperwork") setActiveFilter("paperwork");
      if (deepLink.queue === "ready-for-mel") setActiveFilter("ready-for-mel");
      if (deepLink.queue === "follow-up") setActiveFilter("overdue");
    }
  }

  useEffect(() => {
    if (!deepLink) return;
    if (deepLink.kind === "queue" && deepLink.queue === "work-mode") onHomeModeChange("work");
    if (deepLink.kind === "candidate") onOpenCandidate(deepLink.candidateId);
  }, [deepLink, onHomeModeChange, onOpenCandidate]);

  const snapshot = useMemo(
    () =>
      buildRecruiterActionCenterFromRows({
        rows: candidates,
        opportunities,
        actingRecruiter,
        recruiters,
        activeFilter,
        skippedCandidateIds: skippedIds,
        showTeamLeaderView,
      }),
    [actingRecruiter, activeFilter, candidates, opportunities, recruiters, showTeamLeaderView, skippedIds],
  );

  const filterCounts = useMemo(
    () => countSmartFilterMatches(snapshot.allCandidates, actingRecruiter),
    [actingRecruiter, snapshot.allCandidates],
  );

  const handleOneClick = useCallback(
    (candidateId: string, action: RecruiterOneClickActionId) => {
      const update = mapOneClickActionToWorkflowUpdate({
        candidateId,
        action,
        actingRecruiter,
      });
      const payload = queuePayloadFromOneClick(update);
      if (payload) onQueueAction(candidateId, payload);
      if (update.workflowStatus && onWorkflowStatus) {
        onWorkflowStatus(candidateId, update.workflowStatus);
      }
      if (update.assignedRecruiter && onAssignRecruiter) {
        onAssignRecruiter(candidateId, update.assignedRecruiter);
      }
      if (update.recruitingAction && onRecruitingAction) {
        onRecruitingAction(
          candidateId,
          update.recruitingAction.type,
          update.recruitingAction.enabled,
        );
      }
      if (update.note && onAddNote) {
        onAddNote(candidateId, update.note);
      }
    },
    [actingRecruiter, onAddNote, onAssignRecruiter, onQueueAction, onRecruitingAction, onWorkflowStatus],
  );

  const workCandidate = snapshot.workMode.nextCandidate;

  function handleSkipWorkMode() {
    if (!workCandidate) return;
    setSkippedIds((prev) => [...prev, workCandidate.candidateId]);
  }

  return (
    <section
      id={RECRUITER_ACTION_CENTER_ELEMENT_IDS.root}
      className="space-y-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
      aria-labelledby="recruiter-action-center-heading"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="recruiter-action-center-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Recruiter action center
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Priority queues, productivity, and one-click workflow actions from cached candidate data.
          </p>
          <div className="mt-2 min-h-[1.125rem] text-xs leading-snug text-amber-200/90">
            {syncPartial ? (
              <p className="line-clamp-2">Partial Breezy hydration — queue counts may grow after full sync.</p>
            ) : null}
            {syncStale ? <p className="line-clamp-2">Showing last successful Breezy snapshot.</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-zinc-400">
            Acting recruiter
            <select
              value={actingRecruiter}
              onChange={(event) => onActingRecruiterChange(event.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1.5 text-sm text-zinc-100"
            >
              {recruiters.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div
            className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-0.5"
            role="group"
            aria-label="Recruiter home mode"
          >
            {(
              [
                ["dashboard", "Dashboard"],
                ["work", "Work Mode"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onHomeModeChange(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  homeMode === mode ? "bg-teal-600/25 text-teal-100" : "text-zinc-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SMART_FILTERS.map(({ id, label }) => {
          const active = activeFilter === id;
          const count = filterCounts[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveFilter(activeFilter === id ? null : id)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium",
                active
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                  : "border-zinc-700 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
              ].join(" ")}
            >
              {label}
              {count > 0 ? <span className="ml-1 tabular-nums text-zinc-500">({count})</span> : null}
            </button>
          );
        })}
      </div>

      <div
        id={RECRUITER_ACTION_CENTER_ELEMENT_IDS.productivity}
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      >
        <KpiCard label="Worked today" value={snapshot.productivity.today.candidatesWorked} goal={12} />
        <KpiCard label="Follow-ups done" value={snapshot.productivity.today.followUpsCompleted} />
        <KpiCard label="Paperwork sent" value={snapshot.productivity.today.paperworkSent} />
        <KpiCard label="Ready for MEL" value={snapshot.productivity.today.readyForMel} tone="ok" />
        <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-300/80">Recruiter score</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-teal-100">
            {snapshot.recruiterScore.score}
            <span className="ml-2 text-xs font-normal text-teal-200/80">
              {recruiterScoreLevelLabel(snapshot.recruiterScore.level)}
            </span>
          </p>
        </div>
      </div>

      {homeMode === "work" ? (
        <article
          id={RECRUITER_ACTION_CENTER_ELEMENT_IDS.workMode}
          className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300">Work mode</p>
          {workCandidate ? (
            <div className="mt-3 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <button
                  type="button"
                  onClick={() => onOpenCandidate(workCandidate.candidateId)}
                  className="text-left"
                >
                  <p className="text-xl font-semibold text-zinc-50">{workCandidate.candidateName}</p>
                  <p className="mt-1 text-sm text-zinc-400">{workCandidate.locationLabel}</p>
                  <p className="mt-1 text-xs text-zinc-500">{workCandidate.jobLabel}</p>
                </button>
                <p className="mt-3 text-base font-semibold text-teal-100">{workCandidate.nextActionLabel}</p>
                <p className="mt-2 text-sm text-zinc-400">{workCandidate.reason}</p>
                <p className="mt-1 text-xs text-zinc-500">{workCandidate.relatedNeed}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => onOpenCandidate(workCandidate.candidateId)}
                    className="rounded-lg border border-teal-500/40 bg-teal-600/20 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-600/30 disabled:opacity-50"
                  >
                    Open candidate
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipWorkMode}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800/60"
                  >
                    Skip
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">One-click actions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {workCandidate.oneClickActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleOneClick(workCandidate.candidateId, action)}
                      className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-2.5 py-1 text-xs text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {ONE_CLICK_ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs text-zinc-500">
                  Progress today: {snapshot.workMode.progressToday} / {snapshot.workMode.goalToday}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">Queue is clear for {actingRecruiter}.</p>
          )}
        </article>
      ) : null}

      <div
        id={RECRUITER_ACTION_CENTER_ELEMENT_IDS.paperwork}
        className="sr-only"
        aria-hidden
      />
      <div
        id={RECRUITER_ACTION_CENTER_ELEMENT_IDS.readyForMel}
        className="sr-only"
        aria-hidden
      />
      <div id={RECRUITER_ACTION_CENTER_ELEMENT_IDS.legacyQueue} className="sr-only" aria-hidden />

      <div className="space-y-3">
        {(["work-now", "work-today", "work-this-week", "monitor"] as const).map((section) => {
          const rows = snapshot.queues[section];
          const sectionId =
            section === "work-now" ? RECRUITER_ACTION_CENTER_ELEMENT_IDS.workNow : RECRUITER_ACTION_CENTER_ELEMENT_IDS.root;
          const expanded = expandedQueue === section || rows.length <= 3;
          return (
            <section
              key={section}
              id={sectionId}
              className="rounded-xl border border-zinc-800/80 bg-zinc-950/30"
            >
              <button
                type="button"
                onClick={() => setExpandedQueue(expanded && rows.length > 3 ? null : section)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-zinc-100">{QUEUE_SECTION_LABELS[section]}</span>
                <span className="text-xs tabular-nums text-zinc-500">{rows.length}</span>
              </button>
              {expanded && rows.length > 0 ? (
                <ul className="divide-y divide-zinc-800/60 border-t border-zinc-800/60">
                  {rows.slice(0, 12).map((row) => (
                    <li key={row.candidateId} className="px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <button
                          type="button"
                          onClick={() => onOpenCandidate(row.candidateId)}
                          className="min-w-0 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-zinc-50">{row.candidateName}</p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${PRIORITY_BAND_STYLES[row.priorityBand]}`}
                            >
                              {priorityBandLabel(row.priorityBand)}
                            </span>
                            <span className="text-[10px] tabular-nums text-zinc-500">{row.priorityScore}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {row.locationLabel} · {row.workflowStatus}
                          </p>
                          <p className="mt-1 text-xs text-teal-200/90">{row.nextActionLabel}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">{row.reason}</p>
                          {row.bottlenecks.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {row.bottlenecks.map((badge) => (
                                <span
                                  key={badge}
                                  className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-100"
                                >
                                  {BOTTLENECK_BADGE_LABELS[badge]}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </button>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          {row.oneClickActions.slice(0, 4).map((action) => (
                            <button
                              key={action}
                              type="button"
                              disabled={actionBusy}
                              onClick={() => handleOneClick(row.candidateId, action)}
                              className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                            >
                              {ONE_CLICK_ACTION_LABELS[action]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : expanded ? (
                <p className="border-t border-zinc-800/60 px-4 py-3 text-xs text-zinc-500">No candidates in this queue.</p>
              ) : null}
            </section>
          );
        })}
      </div>

      <div
        id={RECRUITER_ACTION_CENTER_ELEMENT_IDS.followUp}
        className="grid gap-2 sm:grid-cols-3"
      >
        <KpiCard
          label="Week follow-ups"
          value={snapshot.productivity.week.followUpsCompleted}
          tone={filterCounts.overdue > 0 ? "warn" : undefined}
        />
        <KpiCard label="Week paperwork" value={snapshot.productivity.week.paperworkSent} />
        <KpiCard label="Month placements" value={snapshot.productivity.month.placementsInfluenced} tone="ok" />
      </div>

      {showTeamLeaderView && snapshot.teamLeaderView.length > 0 ? (
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 px-4 py-4">
          <h3 className="text-sm font-semibold text-zinc-100">Team leader view</h3>
          <p className="mt-1 text-xs text-zinc-500">Recruiter workload and support signals.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Recruiter</th>
                  <th className="pb-2 pr-4 font-medium">Assigned</th>
                  <th className="pb-2 pr-4 font-medium">Worked today</th>
                  <th className="pb-2 pr-4 font-medium">Open F/U</th>
                  <th className="pb-2 pr-4 font-medium">Overdue</th>
                  <th className="pb-2 pr-4 font-medium">Paperwork aging</th>
                  <th className="pb-2 pr-4 font-medium">MEL backlog</th>
                  <th className="pb-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                {snapshot.teamLeaderView.map((row) => (
                  <tr
                    key={row.recruiterName}
                    className={
                      row.highlight === "needs-support"
                        ? "bg-amber-500/5"
                        : row.highlight === "top-performer"
                          ? "bg-teal-500/5"
                          : undefined
                    }
                  >
                    <td className="py-2 pr-4 font-medium">{row.recruiterName}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.assigned}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.workedToday}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.openFollowUps}</td>
                    <td className="py-2 pr-4 tabular-nums text-amber-200">{row.overdueFollowUps}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.paperworkAging}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.readyForMelBacklog}</td>
                    <td className="py-2 tabular-nums">
                      {row.productivityScore}{" "}
                      <span className="text-zinc-500">{recruiterScoreLevelLabel(row.productivityLevel)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-zinc-600">
        Snapshot {new Date(snapshot.generatedAt).toLocaleString()} · {snapshot.allCandidates.length} candidates scored
      </p>
    </section>
  );
}
