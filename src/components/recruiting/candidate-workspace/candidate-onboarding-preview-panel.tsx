"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";
import {
  buildOnboardingWorkspaceCandidateSnapshot,
  isAutonomousOnboardingPipelineCandidate,
} from "@/lib/autonomous-onboarding-engine";
import type { OnboardingPreviewCandidateInput, OnboardingStallLevel } from "@/lib/autonomous-onboarding-engine/types";
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

function stallBadgeClass(level: OnboardingStallLevel): string {
  switch (level) {
    case "blocked":
      return "border-rose-400/40 text-rose-200";
    case "high_risk":
      return "border-amber-400/40 text-amber-200";
    case "needs_attention":
      return "border-yellow-400/40 text-yellow-200";
    default:
      return "border-emerald-400/40 text-emerald-200";
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CandidateOnboardingPreviewPanel({ candidate }: { candidate: CandidateDrawerRow }) {
  const preview = useMemo(() => {
    const row = toPreviewInput(candidate);
    if (!isAutonomousOnboardingPipelineCandidate(row)) return null;
    return buildOnboardingWorkspaceCandidateSnapshot({ row, onboarding: null });
  }, [candidate]);

  if (!preview) return null;

  return (
    <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">Onboarding automation</h3>
        <span className="rounded-full border border-violet-400/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
          Preview
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stallBadgeClass(preview.stall.level)}`}
        >
          {preview.stall.label}
        </span>
      </div>

      <p className="mt-1 text-xs text-zinc-400">
        Current state: <span className="text-zinc-200">{preview.currentStateLabel}</span>
      </p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <span>Progress</span>
          <span>
            {preview.progress.completedCount} of {preview.progress.totalSteps} steps
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${preview.progress.progressPercent}%` }}
          />
        </div>
        <p className="mt-1 font-mono text-[11px] tracking-widest text-violet-200">{preview.progress.progressBar}</p>
        <p className="mt-1 text-xs text-zinc-300">{preview.progress.progressPercent}% complete</p>
      </div>

      {preview.lastActivity ? (
        <div className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Last activity</p>
          <p className="mt-1 text-sm text-zinc-100">{preview.lastActivity.label}</p>
          <p className="mt-1 text-xs text-zinc-400">{formatWhen(preview.lastActivity.completedAt)}</p>
          <p className="mt-1 text-xs text-zinc-500">Elapsed: {preview.lastActivity.elapsedLabel}</p>
        </div>
      ) : null}

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Activity timeline</p>
        <ul className="mt-2 space-y-2 text-xs">
          {preview.activityTimeline.map((entry) => (
            <li key={entry.id} className="flex gap-2">
              <span className="text-zinc-500">{entry.status === "completed" ? "✓" : "→"}</span>
              <div>
                <p className={entry.status === "current" ? "text-violet-200" : "text-zinc-200"}>{entry.label}</p>
                {entry.at ? <p className="text-zinc-500">{formatWhen(entry.at)}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Next step</p>
          <p className="mt-1 text-xs text-zinc-200">{preview.nextStepLabel}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Ready for work</p>
          <p className="mt-1 text-xs text-zinc-200">
            {preview.readiness.status === "ready_for_work" ? "Ready For Work" : "Missing Requirements"}
          </p>
        </div>
      </div>

      {preview.nextPlannedAutomation ? (
        <p className="mt-3 text-xs text-zinc-400">
          Next planned automation: <span className="text-zinc-200">{preview.nextPlannedAutomation.label}</span> (
          {preview.nextPlannedAutomation.status})
        </p>
      ) : null}

      {preview.readiness.missingRequirementLabels.length > 0 ? (
        <p className="mt-3 text-xs text-amber-200/90">
          Missing: {preview.readiness.missingRequirementLabels.join(", ")}
        </p>
      ) : null}

      {preview.welcomeEmail ? (
        <details className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-teal-200">
            Welcome email preview (not sent)
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-zinc-400">
            {preview.welcomeEmail.bodyText}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
