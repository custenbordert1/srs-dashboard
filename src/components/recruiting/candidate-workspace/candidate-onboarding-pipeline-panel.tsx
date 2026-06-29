"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";
import {
  buildOnboardingPipelineRecord,
  isOnboardingPipelineEligible,
  pipelineStageLabel,
} from "@/lib/onboarding-pipeline-engine";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import { useMemo } from "react";

function toPreviewInput(candidate: CandidateDrawerRow): OnboardingPreviewCandidateInput {
  return {
    candidateId: candidate.candidateId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    appliedDate: candidate.appliedDate,
    workflowStatus: candidate.workflowStatus,
    paperworkStatus: candidate.paperworkStatus,
    paperworkError: candidate.paperworkError,
    paperworkSentAt: candidate.paperworkSentAt,
    paperworkSignedAt: candidate.paperworkSignedAt,
    signatureRequestId: candidate.signatureRequestId,
    assignedRecruiter: candidate.assignedRecruiter,
  };
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function timelineDotClass(status: "completed" | "current" | "upcoming"): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "current":
      return "bg-sky-500 ring-4 ring-sky-500/25";
    default:
      return "bg-zinc-700";
  }
}

function priorityClass(priority: string): string {
  switch (priority) {
    case "high":
      return "text-rose-200";
    case "medium":
      return "text-amber-200";
    default:
      return "text-zinc-400";
  }
}

export function CandidateOnboardingPipelinePanel({ candidate }: { candidate: CandidateDrawerRow }) {
  const record = useMemo(() => {
    const row = toPreviewInput(candidate);
    if (!isOnboardingPipelineEligible(row)) return null;
    return buildOnboardingPipelineRecord({
      row,
      onboarding: null,
      context: {
        assignedDM: candidate.assignedDM,
        positionName: candidate.positionName,
        suggestedProjects: candidate.suggestedProjects,
      },
    });
  }, [candidate]);

  if (!record) return null;

  return (
    <section className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">Onboarding pipeline</h3>
        <span className="rounded-full border border-sky-400/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
          Preview Mode
        </span>
        {record.stalled ? (
          <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
            Stalled
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-xs text-zinc-400">
        Current stage: <span className="text-zinc-200">{pipelineStageLabel(record.stage)}</span>
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Readiness</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{record.readiness.score}</p>
          <p className="text-xs text-zinc-400">{record.readiness.confidence}% confidence</p>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Est. completion</p>
          <p className="mt-1 text-sm font-medium text-zinc-100">{formatWhen(record.estimatedCompletionAt)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Current due</p>
          <p className="mt-1 text-sm font-medium text-zinc-100">{formatWhen(record.dueDates.currentStageDueAt)}</p>
        </div>
      </div>

      {record.readiness.blockers.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">Remaining blockers</p>
          <ul className="mt-1 list-inside list-disc text-xs text-zinc-300">
            {record.readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <span>Progress</span>
          <span>{record.progressPercent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{ width: `${record.progressPercent}%` }}
          />
        </div>
      </div>

      {record.welcomeEmail ? (
        <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Welcome email (preview)</p>
          <p className="mt-1 text-sm font-medium text-zinc-100">{record.welcomeEmail.subject}</p>
          <div className="mt-2 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
            <span>Recruiter: {candidate.assignedRecruiter}</span>
            <span>DM: {record.welcomeEmail.districtManager}</span>
            <span>Project: {record.welcomeEmail.assignedProject ?? "Pending"}</span>
          </div>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-900/80 p-3 text-xs text-zinc-300">
            {record.welcomeEmail.bodyText}
          </pre>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Workflow checklist</p>
        <ul className="mt-2 space-y-2">
          {record.workflowTasks.map((task) => (
            <li key={task.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{task.label}</p>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{task.status}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{task.description}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Due {formatWhen(task.dueAt)} · ~{task.estimatedMinutes} min
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Training assignments (preview)</p>
        <ul className="mt-2 space-y-2">
          {record.trainingAssignments.map((assignment) => (
            <li key={assignment.key} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{assignment.label}</p>
                <span className="text-zinc-400">{assignment.stateLabel}</span>
              </div>
              <p className="mt-1 text-zinc-500">
                Due {formatWhen(assignment.dueAt)} · ~{assignment.estimatedCompletionMinutes} min
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Pipeline timeline</p>
        <ol className="mt-3 space-y-0">
          {record.timeline.map((entry, index) => (
            <li key={entry.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${timelineDotClass(entry.status)}`} />
                {index < record.timeline.length - 1 ? (
                  <span className="my-1 w-px flex-1 bg-zinc-800" />
                ) : null}
              </div>
              <div className="pb-4">
                <p
                  className={
                    entry.status === "current"
                      ? "text-sm font-medium text-sky-200"
                      : entry.status === "completed"
                        ? "text-sm text-zinc-200"
                        : "text-sm text-zinc-500"
                  }
                >
                  {entry.label}
                </p>
                {entry.at ? <p className="mt-0.5 text-xs text-zinc-500">{formatWhen(entry.at)}</p> : null}
                {entry.detail ? <p className="mt-1 text-xs text-zinc-400">{entry.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {record.previewActions.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Preview actions</p>
          <ul className="mt-2 space-y-2">
            {record.previewActions.map((action) => (
              <li key={action.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{action.label}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {action.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">{action.description}</p>
                {action.detail ? <p className="mt-1 text-xs text-zinc-500">{action.detail}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {record.recruiterActions.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Recruiter recommendations</p>
          <ul className="mt-2 space-y-2">
            {record.recruiterActions.map((action) => (
              <li
                key={action.id}
                className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-zinc-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{action.label}</p>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${priorityClass(action.priority)}`}>
                    {action.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">{action.description}</p>
              </li>
            ))}
          </ul>
          {record.stallReason ? (
            <p className="mt-2 text-xs text-amber-200/80">Stall reason: {record.stallReason}</p>
          ) : null}
        </div>
      ) : null}

      {record.activityHistory.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Activity history</p>
          <ul className="mt-2 space-y-2">
            {record.activityHistory.map((entry) => (
              <li key={entry.id} className="flex gap-2 text-xs">
                <span className="text-zinc-500">{entry.status === "completed" ? "✓" : "→"}</span>
                <div>
                  <p className="text-zinc-200">{entry.label}</p>
                  {entry.at ? <p className="text-zinc-500">{formatWhen(entry.at)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
