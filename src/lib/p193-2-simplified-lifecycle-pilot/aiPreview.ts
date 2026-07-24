import type { BreezyCandidate } from "@/lib/breezy-api";
import { evaluateP193AiQualification } from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
import type { P1932AiReviewRow, P1932FrozenCohort } from "@/lib/p193-2-simplified-lifecycle-pilot/types";

export function runP1932AiReviewPreview(input: {
  cohort: P1932FrozenCohort;
  candidatesById: Record<string, BreezyCandidate>;
  nearbyJobsByCandidate?: Record<
    string,
    Array<{ jobId: string; title: string; city: string; state: string; zip?: string }>
  >;
}): {
  rows: P1932AiReviewRow[];
  counts: { Qualified: number; "Needs Human Review": number; "Not Qualified": number };
} {
  const rows: P1932AiReviewRow[] = [];
  const counts = { Qualified: 0, "Needs Human Review": 0, "Not Qualified": 0 };

  for (const member of input.cohort.members) {
    const candidate = input.candidatesById[member.candidateId];
    if (!candidate) {
      rows.push({
        candidateId: member.candidateId,
        decision: "Needs Human Review",
        confidence: 0,
        resumeScore: null,
        questionnaireScore: null,
        experienceYears: null,
        nearbyJobCount: 0,
        distanceToNearestWorkMiles: null,
        duplicateSuspect: false,
        fraudSpamScore: null,
        borderline: true,
        reasons: ["candidate_missing_from_ingestion"],
        missingData: ["candidate_record"],
        explanation: "Candidate missing from ingestion snapshot — human review required.",
      });
      counts["Needs Human Review"] += 1;
      continue;
    }

    const result = evaluateP193AiQualification({
      candidate,
      workflowStatus: member.legacyWorkflowStatus,
      questionnaireScore: candidate.hasQuestionnaire
        ? Math.min(95, 55 + Math.min(20, (candidate.questionnaireAnswers?.length ?? 0)))
        : 35,
      questionnaireAnswerCount: candidate.questionnaireAnswers?.length ?? 0,
      nearbyJobs: input.nearbyJobsByCandidate?.[member.candidateId] ?? [
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

    // Never auto-reject borderline — already handled in evaluator; reinforce here.
    let decision = result.decision;
    if (result.borderline && decision === "Not Qualified") {
      decision = "Needs Human Review";
    }

    const missingData: string[] = [];
    if (!candidate.hasResume && !(candidate.resumeText && candidate.resumeText.length > 40)) {
      missingData.push("resume");
    }
    if (!candidate.hasQuestionnaire) missingData.push("questionnaire");
    if (!candidate.zipCode) missingData.push("zip");

    const row: P1932AiReviewRow = {
      candidateId: member.candidateId,
      decision,
      confidence: result.confidenceScore,
      resumeScore: result.metadata.resumeScore ?? null,
      questionnaireScore: result.metadata.questionnaireScore ?? null,
      experienceYears: result.metadata.experienceYears ?? null,
      nearbyJobCount: result.metadata.nearbyJobs?.length ?? 0,
      distanceToNearestWorkMiles: result.metadata.distanceToNearestWorkMiles ?? null,
      duplicateSuspect: Boolean(result.metadata.duplicateSuspect),
      fraudSpamScore: result.metadata.fraudSpamScore ?? null,
      borderline: result.borderline,
      reasons: result.reasons,
      missingData,
      explanation:
        result.metadata.aiSummary ??
        `decision=${decision} confidence=${result.confidenceScore} reasons=${result.reasons.join(",")}`,
    };
    rows.push(row);
    counts[decision] += 1;
  }

  return { rows, counts };
}
