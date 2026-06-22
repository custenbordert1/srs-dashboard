import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ApplicantReviewResult, ApplicantReviewVerdict } from "@/lib/hiring-automation-engine/types";

function hasContributor(row: ScoredCandidateWorkflowRow, fragment: string): boolean {
  return row.candidateGrade.gradeContributors.some((item) =>
    item.label.toLowerCase().includes(fragment.toLowerCase()),
  );
}

export function evaluateApplicantReview(row: ScoredCandidateWorkflowRow): ApplicantReviewResult {
  const grade = row.candidateGrade;
  const missingItems: string[] = [];
  const unknownItems: string[] = [];
  const strengths = [...grade.strengths];
  const concerns = [...grade.concerns];

  if (!row.hasResume) missingItems.push("Resume not uploaded");
  if (!row.questionnaireIntelligence.available) unknownItems.push("Questionnaire not completed");
  if (row.questionnaireIntelligence.techReady === false) missingItems.push("Technology readiness unverified");
  if (hasContributor(row, "Transportation not confirmed")) missingItems.push("Transportation not confirmed");
  if (hasContributor(row, "Merchandising experience")) {
    strengths.push("Merchandising experience detected");
  }
  if (row.resumeIntelligence.signalBadges.some((b) => b.id === "retail" && b.detected)) {
    strengths.push("Retail experience detected");
  }

  let verdict: ApplicantReviewVerdict = "needs-review";

  if (grade.grade === "D" || row.workflowStatus === "Not Qualified") {
    verdict = "disqualified";
  } else if (missingItems.length >= 2 || (grade.confidence === "low" && missingItems.length > 0)) {
    verdict = "incomplete";
  } else if (
    (grade.grade === "A" || grade.grade === "B") &&
    (grade.confidence === "high" || grade.confidence === "medium")
  ) {
    verdict = "qualified";
  } else if (grade.grade === "C") {
    verdict = "needs-review";
  }

  const qualified = verdict === "qualified";

  const summary =
    verdict === "qualified"
      ? `Grade ${grade.grade} (${grade.confidence} confidence) — qualified for next hiring step.`
      : verdict === "disqualified"
        ? `Grade ${grade.grade} — not recommended for automation.`
        : verdict === "incomplete"
          ? `Grade ${grade.grade} — missing data blocks automation (${missingItems.join(", ") || "unknown gaps"}).`
          : `Grade ${grade.grade} (${grade.confidence} confidence) — recruiter review recommended.`;

  return {
    candidateId: row.candidateId,
    verdict,
    grade: grade.grade,
    confidence: grade.confidence,
    qualified,
    missingItems,
    unknownItems,
    strengths,
    concerns,
    summary,
  };
}
