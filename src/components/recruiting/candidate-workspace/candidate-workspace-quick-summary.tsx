"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";

type CandidateWorkspaceQuickSummaryProps = {
  candidate: CandidateDrawerRow;
  nearbyJobCount: number;
  nearestDistanceMiles: number | null;
  confidence: number | null;
};

function formatMiles(miles: number | null): string {
  if (miles === null || !Number.isFinite(miles)) return "—";
  return `${miles.toFixed(1)} mi`;
}

export function CandidateWorkspaceQuickSummary({
  candidate,
  nearbyJobCount,
  nearestDistanceMiles,
  confidence,
}: CandidateWorkspaceQuickSummaryProps) {
  const experience =
    candidate.resumeIntelligence.quality.employmentHistoryCount != null
      ? `${candidate.resumeIntelligence.quality.employmentHistoryCount} role(s)`
      : candidate.merchandisingExperienceScore != null
        ? `Merch score ${candidate.merchandisingExperienceScore}`
        : "—";
  const availability =
    candidate.questionnaireIntelligence.availabilityNotes?.trim() ||
    (candidate.questionnaireIntelligence.readinessChecks.find((c) => /availab/i.test(c.label))
      ? "Listed on questionnaire"
      : "—");

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Quick candidate summary
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
        <div className="sm:col-span-2">
          <dt className="text-zinc-500">AI recommendation</dt>
          <dd className="text-zinc-100">{candidate.aiRecommendation || "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Confidence</dt>
          <dd className="tabular-nums text-zinc-100">
            {confidence !== null ? Math.round(confidence) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Nearby jobs</dt>
          <dd className="tabular-nums text-zinc-100">{nearbyJobCount}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Experience</dt>
          <dd className="text-zinc-100">{experience}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Distance</dt>
          <dd className="tabular-nums text-zinc-100">{formatMiles(nearestDistanceMiles)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-zinc-500">Availability</dt>
          <dd className="text-zinc-100">{availability}</dd>
        </div>
      </dl>
    </section>
  );
}
