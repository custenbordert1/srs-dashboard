import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateIntelligenceFilterId } from "@/lib/candidate-readiness/types";

export function matchesCandidateIntelligenceFilter(
  row: ScoredCandidateWorkflowRow,
  filter: CandidateIntelligenceFilterId,
): boolean {
  const grade = row.candidateGrade;
  const resume = row.resumeIntelligence;
  const questionnaire = row.questionnaireIntelligence;

  switch (filter) {
    case "grade-a":
      return grade.grade === "A";
    case "grade-b":
      return grade.grade === "B";
    case "tech-ready":
      return questionnaire.techReady === true || grade.techReady === true;
    case "needs-phone-confirmation":
      return !row.phone?.trim() || questionnaire.smartphoneAccess === null;
    case "retail-experience":
      return resume.merchandisingRetailExperience === true;
    case "no-merchandising":
      return (
        resume.merchandisingRetailExperience !== true &&
        !questionnaire.merchandisingExperience?.trim()
      );
    case "missing-questionnaire":
      return !questionnaire.available;
    case "missing-resume":
      return !resume.available && !row.hasResume;
    default:
      return true;
  }
}
