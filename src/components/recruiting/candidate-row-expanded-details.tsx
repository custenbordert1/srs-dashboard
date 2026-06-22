"use client";

import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { paperworkStatusLabel } from "@/lib/candidate-paperwork";

type CandidateRowExpandedDetailsProps = {
  candidate: ScoredCandidateWorkflowRow;
};

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-200">{value || "—"}</p>
    </div>
  );
}

export function CandidateRowExpandedDetails({ candidate }: CandidateRowExpandedDetailsProps) {
  const appliedLabel = candidate.appliedDate
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(candidate.appliedDate))
    : "—";

  return (
    <div className="grid gap-4 border-t border-zinc-800/60 bg-zinc-950/60 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <DetailField label="Position" value={candidate.positionName ?? ""} />
      <DetailField label="Breezy stage" value={candidate.stage ?? ""} />
      <DetailField label="Applied" value={appliedLabel} />
      <DetailField label="Email" value={candidate.email ?? ""} />
      <DetailField label="Phone" value={candidate.phone ?? ""} />
      <DetailField label="Assigned recruiter" value={candidate.assignedRecruiter} />
      <DetailField label="Assigned DM" value={candidate.assignedDM} />
      <DetailField
        label="Paperwork status"
        value={paperworkStatusLabel(candidate.paperworkStatus)}
      />
      <DetailField label="Training status" value={candidate.workflowStatus} />
      <DetailField
        label="DD status"
        value={candidate.directDepositStatus.replaceAll("_", " ")}
      />
      <DetailField label="Source" value={candidate.source ?? ""} />
      <div className="sm:col-span-2 lg:col-span-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Notes</p>
        {candidate.notes.length === 0 ? (
          <p className="mt-0.5 text-sm text-zinc-500">No local notes yet.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm text-zinc-300">
            {candidate.notes.slice(0, 5).map((note, index) => (
              <li
                key={`${index}-${note.slice(0, 24)}`}
                className="rounded border border-zinc-800/80 bg-zinc-900/50 px-2 py-1"
              >
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>
      {candidate.history.length > 0 ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Workflow history
          </p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-400">
            {candidate.history.slice(0, 8).map((event) => (
              <li key={event.id}>
                {event.createdAt} · {event.type} — {event.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
