"use client";

import type { CandidateDrawerRow } from "@/components/recruiting/candidate-detail-drawer";
import { buildTrainingAssignmentPreview } from "@/lib/autonomous-onboarding-engine/build-welcome-and-training-preview";
import { resolveAutonomousOnboardingState } from "@/lib/autonomous-onboarding-engine/state-machine";
import {
  buildPlacementEligibility,
  buildWorkforceMarketRecommendations,
  type PlacementCandidateInput,
} from "@/lib/workforce-placement-intelligence";
import { useMemo } from "react";

function toPlacementInput(candidate: CandidateDrawerRow): PlacementCandidateInput {
  return {
    candidateId: candidate.candidateId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    city: candidate.city,
    state: candidate.state,
    workflowStatus: candidate.workflowStatus,
    paperworkStatus: candidate.paperworkStatus,
    paperworkError: candidate.paperworkError,
    questionnaireIntelligence: candidate.questionnaireIntelligence,
    resumeIntelligence: candidate.resumeIntelligence,
    candidateGrade: candidate.candidateGrade,
    skillTags: candidate.resumeIntelligence.relevantSkills,
    travelFitScore: candidate.travelFitScore,
    retailExperienceScore: candidate.retailExperienceScore,
    merchandisingExperienceScore: candidate.merchandisingExperienceScore,
    intelligenceTravelRadius: candidate.travelFitScore ?? 0,
    distanceMiles: null,
  };
}

function RequirementRow({ label, complete }: { label: string; complete: boolean }) {
  return (
    <li className={complete ? "text-emerald-300" : "text-rose-300"}>
      {complete ? "✓" : "✗"} {label}
    </li>
  );
}

export function CandidateWorkforcePlacementPreviewPanel({
  candidate,
}: {
  candidate: CandidateDrawerRow;
}) {
  const preview = useMemo(() => {
    const row = toPlacementInput(candidate);
    const eligibility = buildPlacementEligibility({ row });

    const training = buildTrainingAssignmentPreview({
      candidateId: row.candidateId,
      candidateName: `${row.firstName} ${row.lastName}`.trim(),
      workflowStatus: row.workflowStatus,
      paperworkStatus: row.paperworkStatus,
    });
    const onboardingState = resolveAutonomousOnboardingState({
      candidateId: row.candidateId,
      workflowStatus: row.workflowStatus,
      paperworkStatus: row.paperworkStatus,
      trainingComplete: training.allRequiredComplete,
      acknowledgementsComplete: training.allRequiredComplete,
    });

    if (!eligibility.readyForWork) {
      return { eligibility, onboardingState, recommendation: null };
    }

    const { recommendations } = buildWorkforceMarketRecommendations({
      candidates: [{ row, eligibility }],
      opportunities: [],
      activeReps: [],
    });

    return {
      eligibility,
      onboardingState,
      recommendation: recommendations[0] ?? null,
    };
  }, [candidate]);

  if (!preview.eligibility.readyForWork) {
    return (
      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Workforce Placement</h3>
          <span className="rounded-full border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-100">
            Preview
          </span>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Placement intelligence begins after Ready For Work. Current onboarding state:{" "}
          <span className="text-zinc-200">{preview.onboardingState.replaceAll("_", " ")}</span>.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">Workforce Placement</h3>
        <span className="rounded-full border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-100">
          Preview
        </span>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Eligibility</p>
        <ul className="mt-1 space-y-0.5 text-xs">
          {preview.eligibility.requirements.map((req) => (
            <RequirementRow key={req.id} label={req.label} complete={req.complete} />
          ))}
        </ul>
      </div>

      {preview.eligibility.status === "human_review" ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-xs font-semibold text-amber-100">Human Review Required</p>
          <p className="mt-1 text-xs text-amber-200/80">{preview.eligibility.missingReasons.join(" · ")}</p>
        </div>
      ) : null}

      {preview.recommendation ? (
        <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">
            Recommended Market
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-50">
            {preview.recommendation.recommendedMarketLabel}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Demand {preview.recommendation.demandScore} · Confidence{" "}
            {preview.recommendation.confidenceScore}%
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-zinc-300">
            {preview.recommendation.reasoning.map((reason) => (
              <li key={reason.id}>✓ {reason.label}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">{preview.recommendation.coverageImpact}</p>
        </div>
      ) : preview.eligibility.status === "eligible" ? (
        <p className="mt-3 text-xs text-zinc-500">
          Eligible for placement — load market data to generate a recommendation preview.
        </p>
      ) : null}
    </section>
  );
}
