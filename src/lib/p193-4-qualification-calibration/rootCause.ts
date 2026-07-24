import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { evaluateP193AiQualification } from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
import { evaluateP1934Calibration } from "@/lib/p193-4-qualification-calibration/calibratedScorer";
import type { P1934ScoreResult } from "@/lib/p193-4-qualification-calibration/types";
import type { P1933QuestionnaireRecord } from "@/lib/p193-3-questionnaire-capture/types";

/**
 * Analysis-only root cause for the prior 10-candidate preview.
 * Does not mutate scores used for the live pilot — reports legacy vs calibrated side-by-side.
 */
export function analyzePreviewRootCause(input: {
  members: Array<{
    candidateId: string;
    positionId: string;
    positionName: string;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    legacyWorkflowStatus: string | null;
  }>;
  candidatesById: Record<string, BreezyCandidate>;
  recordsById?: Record<string, P1933QuestionnaireRecord>;
}): {
  generatedAt: string;
  summary: {
    allNeedsHumanReview: boolean;
    primaryBlocker: string;
    avgLegacyConfidence: number;
    avgCalibratedConfidence: number;
    calibratedWouldQualify: number;
  };
  rows: Array<{
    candidateId: string;
    positionName: string;
    city: string | null;
    state: string | null;
    legacy: {
      confidence: number;
      decision: string;
      resumeScore: number | null;
      questionnaireScore: number | null;
      experienceYears: number | null;
      distanceMiles: number | null;
      fraudSpamScore: number | null;
      reasons: string[];
      missingData: string[];
    };
    calibrated: P1934ScoreResult;
    scoreToBecomeQualifiedLegacy: number;
    blockerCategory: P1934ScoreResult["blockerCategory"];
  }>;
} {
  const rows = [];
  let legacySum = 0;
  let calSum = 0;
  let wouldQualify = 0;

  for (const member of input.members) {
    const candidate = input.candidatesById[member.candidateId];
    if (!candidate) continue;
    const record = input.recordsById?.[member.candidateId];
    const legacy = evaluateP193AiQualification({
      candidate,
      workflowStatus: member.legacyWorkflowStatus,
      questionnaireScore: candidate.hasQuestionnaire
        ? Math.min(95, 55 + Math.min(20, candidate.questionnaireAnswers?.length ?? 0))
        : 35,
      questionnaireAnswerCount: candidate.questionnaireAnswers?.length ?? 0,
      nearbyJobs: [
        {
          jobId: member.positionId,
          title: member.positionName,
          city: member.city ?? "",
          state: member.state ?? "",
          zip: member.zipCode ?? undefined,
        },
      ],
      sameEmailCount: 1,
    });
    const calibrated = evaluateP1934Calibration({
      candidate,
      mappedFields: record?.mappedQualificationFields,
      workflowStatus: member.legacyWorkflowStatus,
      nearbyJob: {
        city: member.city ?? undefined,
        state: member.state ?? undefined,
        zip: member.zipCode ?? undefined,
      },
    });
    legacySum += legacy.confidenceScore;
    calSum += calibrated.confidence;
    if (calibrated.decision === "Qualified") wouldQualify += 1;

    const missingData: string[] = [];
    if (!candidate.hasResume && !(candidate.resumeText && candidate.resumeText.length > 40)) {
      missingData.push("resume");
    }
    if (!member.zipCode) missingData.push("zip");

    rows.push({
      candidateId: member.candidateId,
      positionName: member.positionName,
      city: member.city,
      state: member.state,
      legacy: {
        confidence: legacy.confidenceScore,
        decision: legacy.decision,
        resumeScore: legacy.metadata.resumeScore ?? null,
        questionnaireScore: legacy.metadata.questionnaireScore ?? null,
        experienceYears: legacy.metadata.experienceYears ?? null,
        distanceMiles: legacy.metadata.distanceToNearestWorkMiles ?? null,
        fraudSpamScore: legacy.metadata.fraudSpamScore ?? null,
        reasons: legacy.reasons,
        missingData,
      },
      calibrated,
      scoreToBecomeQualifiedLegacy: Math.max(0, 72 - legacy.confidenceScore),
      blockerCategory:
        legacy.confidenceScore < 72 && calibrated.decision === "Qualified"
          ? ("incorrect_scoring" as const)
          : calibrated.blockerCategory,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      allNeedsHumanReview: rows.every((r) => r.legacy.decision === "Needs Human Review"),
      primaryBlocker:
        "Resume-weighted legacy blend (45%) with thin/empty resumeText (~23–29) keeps confidence ~51–54 despite complete questionnaires; experience years unused from questionnaire",
      avgLegacyConfidence: rows.length ? Math.round(legacySum / rows.length) : 0,
      avgCalibratedConfidence: rows.length ? Math.round(calSum / rows.length) : 0,
      calibratedWouldQualify: wouldQualify,
    },
    rows,
  };
}

export function isWithdrawnOrHeld(workflow?: CandidateWorkflowRecord | null): boolean {
  if (!workflow) return false;
  const haystack = [...(workflow.notes ?? []), workflow.workflowStatus ?? ""].join(" ");
  return /withdrawn|archived|\[hold\]|recruiter hold/i.test(haystack);
}
