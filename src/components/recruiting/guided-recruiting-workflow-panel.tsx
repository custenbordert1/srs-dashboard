"use client";

import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateRowPrimaryActionKind } from "@/lib/candidate-row-primary-action";
import {
  buildGuidedRecruitingSnapshot,
  resolveGuidedWorkflowQuickActions,
  type GuidedWorkflowQuickActionId,
  type RecruiterHomeMode,
} from "@/lib/guided-recruiting-workflow";
import type { SendPaperworkBlockReason } from "@/lib/onboarding-send-eligibility";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useMemo, useState } from "react";

type GuidedRecruitingWorkflowPanelProps = {
  candidates: ScoredCandidateWorkflowRow[];
  actingRecruiter: string;
  recruiters: string[];
  homeMode: RecruiterHomeMode;
  onHomeModeChange: (mode: RecruiterHomeMode) => void;
  sendBlockReasonFor: (candidate: ScoredCandidateWorkflowRow) => SendPaperworkBlockReason | null;
  onOpenCandidate: (candidateId: string) => void;
  onExecutePrimaryAction: (
    candidate: ScoredCandidateWorkflowRow,
    kind: CandidateRowPrimaryActionKind,
  ) => void;
  onQuickAction: (
    candidate: ScoredCandidateWorkflowRow,
    actionId: GuidedWorkflowQuickActionId,
  ) => void;
  actionBusy?: boolean;
};

function ProgressCard({
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
    <div className={`${UI_SURFACE.cardInset} px-3 py-3`}>
      <p className={UI_TYPE.kpiLabel}>{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-200" : tone === "ok" ? "text-teal-200" : "text-zinc-50"
        }`}
      >
        {value}
        {goal != null ? <span className="text-sm font-normal text-zinc-500"> / {goal}</span> : null}
      </p>
    </div>
  );
}

export function GuidedRecruitingWorkflowPanel({
  candidates,
  actingRecruiter,
  recruiters,
  homeMode,
  onHomeModeChange,
  sendBlockReasonFor,
  onOpenCandidate,
  onExecutePrimaryAction,
  onQuickAction,
  actionBusy = false,
}: GuidedRecruitingWorkflowPanelProps) {
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [focusedCandidateId, setFocusedCandidateId] = useState<string | null>(null);

  const snapshot = useMemo(
    () =>
      buildGuidedRecruitingSnapshot({
        candidates,
        actingRecruiter,
        recruiters,
        skippedCandidateIds: skippedIds,
      }),
    [actingRecruiter, candidates, recruiters, skippedIds],
  );

  const focusedCandidate = useMemo(
    () => candidates.find((row) => row.candidateId === focusedCandidateId) ?? null,
    [candidates, focusedCandidateId],
  );

  const focusedQuickActions = useMemo(() => {
    if (!focusedCandidate) return [];
    return resolveGuidedWorkflowQuickActions({
      candidate: focusedCandidate,
      actingRecruiter,
      sendBlockReason: sendBlockReasonFor(focusedCandidate),
    });
  }, [actingRecruiter, focusedCandidate, sendBlockReasonFor]);

  const displayAction = snapshot.nextBestAction;
  const displayCandidate = displayAction?.candidate ?? null;

  function handleWorkNext() {
    if (!displayCandidate) return;
    setFocusedCandidateId(displayCandidate.candidateId);
    onOpenCandidate(displayCandidate.candidateId);
  }

  function handleSkip() {
    if (!displayCandidate) return;
    setSkippedIds((prev) => [...prev, displayCandidate.candidateId]);
  }

  function handleExecute() {
    if (!displayAction || !displayCandidate) return;
    onExecutePrimaryAction(displayCandidate, displayAction.primaryActionKind);
  }

  return (
    <section
      id="recruiter-action-queue"
      className={`${UI_SURFACE.panel} ${UI_SPACE.page}`}
      aria-labelledby="guided-workflow-heading"
    >
      <div className={UI_LAYOUT.pageHeader}>
        <div>
          <h2 id="guided-workflow-heading" className={UI_TYPE.pageTitle}>
            Guided recruiting workflow
          </h2>
          <p className={UI_TYPE.pageSubtitle}>
            Work from priority — the system tells you who to touch next and why.
          </p>
        </div>
        <div className={UI_LAYOUT.toolbar}>
          <div
            className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-0.5"
            role="group"
            aria-label="Recruiter home mode"
          >
            {(
              [
                ["dashboard", "Dashboard Mode"],
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
          <button type="button" onClick={handleWorkNext} className={UI_BUTTON.primary} disabled={!displayCandidate}>
            Work Next Candidate
          </button>
        </div>
      </div>

      <article className={`${UI_SURFACE.cardInset} border-teal-500/30 bg-teal-500/5 p-4 sm:p-5`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300">
          Next best action
        </p>
        {displayAction && displayCandidate ? (
          <div className="mt-3 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <button
                type="button"
                onClick={() => {
                  setFocusedCandidateId(displayCandidate.candidateId);
                  onOpenCandidate(displayCandidate.candidateId);
                }}
                className="text-left"
              >
                <p className="text-xl font-semibold text-zinc-50">{displayAction.candidateName}</p>
                <p className="mt-1 text-sm text-zinc-400">{displayAction.projectLabel}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-zinc-500">
                  {displayAction.statusLabel}
                </p>
              </button>
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Recommended action
                </p>
                <p className="mt-1 text-base font-semibold text-teal-100">
                  {displayAction.recommendedAction}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  <span className="font-medium text-zinc-300">Reason: </span>
                  {displayAction.reason}
                </p>
              </div>
              <div className={`mt-4 ${UI_LAYOUT.toolbar}`}>
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={actionBusy}
                  className={UI_BUTTON.primary}
                >
                  Execute Action
                </button>
                <button type="button" onClick={handleSkip} className={UI_BUTTON.secondary}>
                  Skip
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <p className={UI_TYPE.sectionSubtitle}>One-click actions</p>
              <div className="flex flex-wrap gap-2">
                {resolveGuidedWorkflowQuickActions({
                  candidate: displayCandidate,
                  actingRecruiter,
                  sendBlockReason: sendBlockReasonFor(displayCandidate),
                }).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={action.disabled || actionBusy}
                    title={action.title}
                    onClick={() => onQuickAction(displayCandidate, action.id)}
                    className={UI_BUTTON.ghost}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">
            Queue is clear for {actingRecruiter}. Check inbox below or switch to Dashboard Mode for the full list.
          </p>
        )}
      </article>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ProgressCard
          label="Candidates worked"
          value={snapshot.productivityToday.candidatesWorked}
          goal={snapshot.productivityToday.goals.candidatesWorked}
        />
        <ProgressCard
          label="Follow-ups completed"
          value={snapshot.productivityToday.followUpsCompleted}
          goal={snapshot.productivityToday.goals.followUpsCompleted}
        />
        <ProgressCard
          label="Paperwork sent"
          value={snapshot.productivityToday.paperworkSent}
          goal={snapshot.productivityToday.goals.paperworkSent}
        />
        <ProgressCard
          label="Ready for MEL"
          value={snapshot.productivityToday.readyForMel}
          goal={snapshot.productivityToday.goals.readyForMel}
          tone="ok"
        />
        <ProgressCard label="New assignments" value={snapshot.productivityToday.newAssignments} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${UI_SURFACE.cardInset} px-3 py-3`}>
          <p className={UI_TYPE.kpiLabel}>Follow-ups today</p>
          <p className={`mt-1 ${UI_TYPE.kpiValue}`}>{snapshot.followUpQueue.today}</p>
        </div>
        <div className={`${UI_SURFACE.cardInset} px-3 py-3`}>
          <p className={UI_TYPE.kpiLabel}>Follow-ups tomorrow</p>
          <p className={`mt-1 ${UI_TYPE.kpiValue}`}>{snapshot.followUpQueue.tomorrow}</p>
        </div>
        <div className={`${UI_SURFACE.cardInset} px-3 py-3 border-red-500/30 bg-red-500/8`}>
          <p className={`${UI_TYPE.kpiLabel} text-red-200/80`}>Overdue</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-100">
            {snapshot.followUpQueue.overdue}
          </p>
        </div>
      </div>

      <section className={UI_SPACE.section}>
        <h3 className={UI_TYPE.sectionTitle}>Recruiter inbox</h3>
        <p className={UI_TYPE.pageSubtitle}>Candidates requiring attention — work inbox first.</p>
        {snapshot.inbox.length === 0 ? (
          <p className="text-sm text-zinc-500">Inbox is clear.</p>
        ) : (
          <ul className={UI_SPACE.stackSm}>
            {snapshot.inbox.map((item) => (
              <li key={item.candidateId}>
                <button
                  type="button"
                  onClick={() => {
                    setFocusedCandidateId(item.candidateId);
                    onOpenCandidate(item.candidateId);
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left hover:border-teal-500/30 ${
                    item.overdue ? "border-red-500/35 bg-red-500/8" : UI_SURFACE.cardInset
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-zinc-50">{item.candidateName}</p>
                      <span
                        className={
                          item.reasonId === "escalation"
                            ? UI_BADGE.high
                            : item.reasonId === "ready-for-mel"
                              ? UI_BADGE.healthy
                              : UI_BADGE.neutral
                        }
                      >
                        {item.reasonLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{item.projectLabel}</p>
                    <p className="mt-1 text-xs text-teal-200/90">{item.recommendedAction}</p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500">{item.priorityScore}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {focusedCandidate && focusedQuickActions.length > 0 ? (
        <section className={`${UI_SURFACE.cardInset} p-3`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Focused candidate actions</p>
          <div className={`mt-2 ${UI_LAYOUT.toolbar}`}>
            {focusedQuickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled || actionBusy}
                onClick={() => onQuickAction(focusedCandidate, action.id)}
                className={UI_BUTTON.secondary}
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={UI_SPACE.section}>
          <h3 className={UI_TYPE.sectionTitle}>Action history</h3>
          {snapshot.recentActionHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">No recent recruiter actions logged.</p>
          ) : (
            <ul className={UI_SPACE.stackSm}>
              {snapshot.recentActionHistory.map((entry) => (
                <li key={`${entry.candidateId}:${entry.occurredAt}`} className={`${UI_SURFACE.cardInset} px-3 py-2`}>
                  <p className="text-sm text-zinc-100">
                    <span className="font-medium">{entry.candidateName}</span> — {entry.actionLabel}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {entry.actorLabel} · {entry.occurredAt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={UI_SPACE.section}>
          <h3 className={UI_TYPE.sectionTitle}>Daily recruiting scoreboard</h3>
          <div className="overflow-x-auto">
            <table className={UI_LAYOUT.responsiveTable}>
              <thead className={UI_TYPE.tableHead}>
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Worked</th>
                  <th className="px-3 py-2">Paperwork</th>
                  <th className="px-3 py-2">MEL</th>
                  <th className="px-3 py-2">Placements</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                {[snapshot.scoreboard.today, snapshot.scoreboard.week, snapshot.scoreboard.month].map((row) => (
                  <tr key={row.label}>
                    <td className="px-3 py-2 font-medium">{row.label}</td>
                    <td className="px-3 py-2 tabular-nums">{row.candidatesWorked}</td>
                    <td className="px-3 py-2 tabular-nums">{row.paperworkSent}</td>
                    <td className="px-3 py-2 tabular-nums">{row.readyForMel}</td>
                    <td className="px-3 py-2 tabular-nums">{row.placements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className={UI_SPACE.section}>
        <h3 className={UI_TYPE.sectionTitle}>Team leader view</h3>
        <div className={UI_SURFACE.tableWrap}>
          <table className={UI_LAYOUT.responsiveTable}>
            <thead className={UI_TYPE.tableHead}>
              <tr>
                <th className="px-3 py-2">Recruiter</th>
                <th className="px-3 py-2">Open</th>
                <th className="px-3 py-2">Worked today</th>
                <th className="px-3 py-2">Open actions</th>
                <th className="px-3 py-2">Paperwork aging</th>
                <th className="px-3 py-2">MEL backlog</th>
                <th className="px-3 py-2">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {snapshot.teamLeaderRows.map((row) => (
                <tr key={row.recruiterName}>
                  <td className="px-3 py-2 font-medium">{row.recruiterName}</td>
                  <td className="px-3 py-2">{row.assignedOpen}</td>
                  <td className="px-3 py-2">{row.candidatesWorkedToday}</td>
                  <td className="px-3 py-2">{row.openActions}</td>
                  <td className="px-3 py-2">
                    <span className={row.paperworkAging > 0 ? UI_BADGE.high : UI_BADGE.neutral}>
                      {row.paperworkAging}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.melReadyBacklog}</td>
                  <td className="px-3 py-2 tabular-nums">{row.productivityScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
