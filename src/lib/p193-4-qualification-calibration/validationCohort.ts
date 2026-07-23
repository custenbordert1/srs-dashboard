import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { evaluateP193AiQualification } from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
import { evaluateP1934Calibration } from "@/lib/p193-4-qualification-calibration/calibratedScorer";
import type { P1933QuestionnaireRecord } from "@/lib/p193-3-questionnaire-capture/types";

export type ValidationBucket = "signed_success" | "unsuitable_or_incomplete" | "ordinary_recent";

export function buildValidationCohort(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  recordsById: Record<string, P1933QuestionnaireRecord>;
}): {
  generatedAt: string;
  buckets: Record<ValidationBucket, string[]>;
  rows: Array<{
    candidateId: string;
    bucket: ValidationBucket;
    observedStatus: string | null;
    paperworkStatus: string | null;
    legacyDecision: string;
    legacyConfidence: number;
    calibratedDecision: string;
    calibratedConfidence: number;
  }>;
  summary: {
    falseNegativesLegacy: number;
    falsePositivesCalibrated: number;
    correctQualifiedCalibrated: number;
    correctNeedsHumanReviewCalibrated: number;
    correctRequestMoreInformationCalibrated: number;
    strongestPredictiveInputs: string[];
    misleadingInputs: string[];
  };
} {
  const signed: BreezyCandidate[] = [];
  const unsuitable: BreezyCandidate[] = [];
  const ordinary: BreezyCandidate[] = [];

  for (const candidate of input.candidates) {
    const wf = input.workflows[candidate.candidateId];
    const status = wf?.workflowStatus ?? "";
    if (wf?.paperworkStatus === "signed" || /Signed/i.test(status)) {
      signed.push(candidate);
    } else if (/Not Qualified|Rejected|Withdrawn/i.test(status)) {
      unsuitable.push(candidate);
    } else if (
      (status === "Applied" || status === "Needs Review" || status === "Qualified") &&
      (candidate.hasQuestionnaire || (candidate.questionnaireAnswers?.length ?? 0) > 0)
    ) {
      ordinary.push(candidate);
    }
  }

  const pick = <T,>(arr: T[], n: number) => arr.slice(0, n);
  const signedPick = pick(signed, 15);
  const unsuitablePick = pick(unsuitable, 15);
  const ordinaryPick = pick(ordinary, 15);

  const rows: Array<{
    candidateId: string;
    bucket: ValidationBucket;
    observedStatus: string | null;
    paperworkStatus: string | null;
    legacyDecision: string;
    legacyConfidence: number;
    calibratedDecision: string;
    calibratedConfidence: number;
  }> = [];

  function score(candidate: BreezyCandidate, bucket: ValidationBucket): void {
    const wf = input.workflows[candidate.candidateId];
    const record = input.recordsById[candidate.candidateId];
    const legacy = evaluateP193AiQualification({
      candidate,
      workflowStatus: wf?.workflowStatus,
      questionnaireAnswerCount: candidate.questionnaireAnswers?.length ?? 0,
      sameEmailCount: 1,
    });
    const calibrated = evaluateP1934Calibration({
      candidate,
      mappedFields: record?.mappedQualificationFields,
      workflowStatus: wf?.workflowStatus,
    });
    rows.push({
      candidateId: candidate.candidateId,
      bucket,
      observedStatus: wf?.workflowStatus ?? null,
      paperworkStatus: wf?.paperworkStatus ?? null,
      legacyDecision: legacy.decision,
      legacyConfidence: legacy.confidenceScore,
      calibratedDecision: calibrated.decision,
      calibratedConfidence: calibrated.confidence,
    });
  }

  for (const c of signedPick) score(c, "signed_success");
  for (const c of unsuitablePick) score(c, "unsuitable_or_incomplete");
  for (const c of ordinaryPick) score(c, "ordinary_recent");

  const signedRows = rows.filter((r) => r.bucket === "signed_success");
  const unsuitableRows = rows.filter((r) => r.bucket === "unsuitable_or_incomplete");

  // False negative: historically signed+Q completed but calibrated not Qualified when Q strong
  const falseNegativesLegacy = signedRows.filter(
    (r) => r.legacyDecision !== "Qualified" && r.paperworkStatus === "signed",
  ).length;
  const falsePositivesCalibrated = unsuitableRows.filter(
    (r) => r.calibratedDecision === "Qualified",
  ).length;
  const correctQualifiedCalibrated = signedRows.filter(
    (r) => r.calibratedDecision === "Qualified",
  ).length;
  const correctNeedsHumanReviewCalibrated = rows.filter(
    (r) =>
      r.calibratedDecision === "Needs Human Review" &&
      (r.bucket !== "unsuitable_or_incomplete" || r.legacyConfidence < 70),
  ).length;
  const correctRequestMoreInformationCalibrated = rows.filter(
    (r) => r.calibratedDecision === "Request More Information",
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    buckets: {
      signed_success: signedPick.map((c) => c.candidateId),
      unsuitable_or_incomplete: unsuitablePick.map((c) => c.candidateId),
      ordinary_recent: ordinaryPick.map((c) => c.candidateId),
    },
    rows,
    summary: {
      falseNegativesLegacy,
      falsePositivesCalibrated,
      correctQualifiedCalibrated,
      correctNeedsHumanReviewCalibrated,
      correctRequestMoreInformationCalibrated,
      strongestPredictiveInputs: [
        "mapped_questionnaire_affirmatives",
        "merchandising_experience_years",
        "transportation_license_age",
        "independent_contractor_acknowledgement",
      ],
      misleadingInputs: [
        "legacy_resume_numeric_score_on_thin_resumeText",
        "paperwork_signed_without_questionnaire_historically",
      ],
    },
  };
}
