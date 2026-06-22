"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";

function formatDate(raw: string): string {
  if (!raw.trim()) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(raw));
  } catch {
    return raw;
  }
}

type CandidateSummaryProps = {
  candidate: CandidateDrawerRow;
  matchScore: number | null;
};

export function CandidateSummary({ candidate, matchScore }: CandidateSummaryProps) {
  const location = [candidate.city, candidate.state].filter(Boolean).join(", ") || "—";

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Candidate summary</h3>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Location</dt>
          <dd className="text-zinc-200">{location}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Position</dt>
          <dd className="text-zinc-200">{candidate.positionName || "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Applied</dt>
          <dd className="text-zinc-200">{formatDate(candidate.appliedDate)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Source</dt>
          <dd className="text-zinc-200">{candidate.source || "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Current stage</dt>
          <dd className="text-zinc-200">{candidate.workflowStatus}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Assigned recruiter</dt>
          <dd className="text-zinc-200">{candidate.assignedRecruiter || "Unassigned"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-zinc-500">Match score</dt>
          <dd className="text-lg font-semibold tabular-nums text-teal-200">
            {matchScore !== null ? `${matchScore}%` : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
