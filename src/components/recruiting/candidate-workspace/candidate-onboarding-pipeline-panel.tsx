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

export function CandidateOnboardingPipelinePanel({ candidate }: { candidate: CandidateDrawerRow }) {
  const record = useMemo(() => {
    const row = toPreviewInput(candidate);
    if (!isOnboardingPipelineEligible(row)) return null;
    return buildOnboardingPipelineRecord({ row, onboarding: null });
  }, [candidate]);

  if (!record) return null;

  return (
    <section className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">Onboarding pipeline</h3>
        <span className="rounded-full border border-sky-400/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
          Preview
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
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Recruiter actions (stalled)</p>
          <ul className="mt-2 space-y-2">
            {record.recruiterActions.map((action) => (
              <li
                key={action.id}
                className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-zinc-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{action.label}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">
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
    </section>
  );
}
