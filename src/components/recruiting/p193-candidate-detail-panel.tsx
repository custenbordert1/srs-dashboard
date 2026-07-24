"use client";

import type { ReactNode } from "react";
import type { P193CandidateStatusViewModel } from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";
import type { P193CandidateMetadata, P193LifecycleRecord } from "@/lib/p193-simplified-autonomous-lifecycle/types";

type Props = {
  /** Preferred: pure serializable view model from server/API or client projection. */
  viewModel?: P193CandidateStatusViewModel | null;
  /** Legacy: full record already projected on the client (no storage access). */
  record?: P193LifecycleRecord | null;
  candidateId?: string;
};

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/80 py-1.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-zinc-200">{value ?? "—"}</span>
    </div>
  );
}

function formatMeta(meta: P193CandidateMetadata) {
  return (
    <div className="mt-3 space-y-0">
      <MetaRow label="Resume score" value={meta.resumeScore} />
      <MetaRow label="Questionnaire score" value={meta.questionnaireScore} />
      <MetaRow label="Experience (years)" value={meta.experienceYears} />
      <MetaRow
        label="Distance to nearest work"
        value={
          meta.distanceToNearestWorkMiles != null
            ? `${meta.distanceToNearestWorkMiles.toFixed(1)} mi`
            : null
        }
      />
      <MetaRow
        label="Nearby jobs"
        value={meta.nearbyJobs.length ? `${meta.nearbyJobs.length} mapped` : "None"}
      />
      <MetaRow label="Confidence" value={meta.confidenceScore} />
      <MetaRow label="AI decision" value={meta.aiDecision} />
      <MetaRow label="Dropbox status" value={meta.paperworkStatus} />
      <MetaRow
        label="Reminders"
        value={`${meta.reminderCount}${meta.lastReminderAt ? ` · last ${meta.lastReminderAt.slice(0, 16)}` : ""}`}
      />
      <MetaRow label="Last viewed" value={meta.lastViewedAt?.slice(0, 19) ?? null} />
      <MetaRow label="Signature" value={meta.signatureTimestamp?.slice(0, 19) ?? null} />
    </div>
  );
}

function formatViewModelMeta(vm: P193CandidateStatusViewModel) {
  return (
    <div className="mt-3 space-y-0">
      <MetaRow label="Confidence" value={vm.confidence} />
      <MetaRow label="AI decision" value={vm.qualificationResult} />
      <MetaRow label="Dropbox status" value={vm.dropboxStatus} />
      <MetaRow
        label="Reminders"
        value={`${vm.reminderCount}${vm.lastReminderAt ? ` · last ${vm.lastReminderAt.slice(0, 16)}` : ""}`}
      />
      <MetaRow label="Last viewed" value={vm.lastViewedAt?.slice(0, 19) ?? null} />
      <MetaRow label="Signature" value={vm.signatureTimestamp?.slice(0, 19) ?? null} />
      <MetaRow label="Nearby jobs" value={vm.nearbyJobCount} />
      <MetaRow
        label="Nearest distance"
        value={vm.nearestDistanceMiles != null ? `${vm.nearestDistanceMiles.toFixed(1)} mi` : null}
      />
      <MetaRow label="Ready for assignment" value={vm.readyForAssignment ? "Yes" : "No"} />
      {vm.stale ? <MetaRow label="Freshness" value="Stale projection" /> : null}
    </div>
  );
}

const PIPELINE = [
  "Applied",
  "AI Reviewed",
  "Paperwork Sent",
  "Viewed",
  "Signed",
  "Ready For Assignment",
] as const;

export function P193CandidateDetailPanel({ viewModel, record }: Props) {
  if (viewModel) {
    if (viewModel.missing) {
      return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">P193 Simplified Timeline</h3>
          <p className="mt-1 text-xs text-zinc-500">No simplified lifecycle record yet.</p>
        </div>
      );
    }
    const labels = new Set<string>(viewModel.timeline.map((t) => t.label));
    if (viewModel.dropboxStatus === "viewed") labels.add("Viewed");
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-200">P193 Simplified Timeline</h3>
          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-200 ring-1 ring-teal-400/30">
            {viewModel.simplifiedStage}
          </span>
        </div>
        <ol className="mt-3 space-y-2">
          {PIPELINE.map((label) => {
            const hit = labels.has(label) || viewModel.simplifiedStage === label;
            return (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full ${hit ? "bg-teal-400" : "bg-zinc-700"}`}
                  aria-hidden
                />
                <span className={hit ? "text-zinc-100" : "text-zinc-600"}>{label}</span>
              </li>
            );
          })}
        </ol>
        {formatViewModelMeta(viewModel)}
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">P193 Simplified Timeline</h3>
        <p className="mt-1 text-xs text-zinc-500">No simplified lifecycle record yet.</p>
      </div>
    );
  }

  const labels = new Set<string>(
    record.timeline.map((t) => (t.state === "AI Reviewing" ? "AI Reviewed" : t.state)),
  );
  if (record.metadata.paperworkStatus === "viewed") labels.add("Viewed");

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">P193 Simplified Timeline</h3>
        <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-200 ring-1 ring-teal-400/30">
          {record.state}
        </span>
      </div>
      <ol className="mt-3 space-y-2">
        {PIPELINE.map((label) => {
          const hit = labels.has(label) || record.state === label;
          return (
            <li key={label} className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${hit ? "bg-teal-400" : "bg-zinc-700"}`}
                aria-hidden
              />
              <span className={hit ? "text-zinc-100" : "text-zinc-600"}>{label}</span>
            </li>
          );
        })}
      </ol>
      {formatMeta(record.metadata)}
    </div>
  );
}
