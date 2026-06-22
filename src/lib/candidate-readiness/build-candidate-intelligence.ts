import type { BreezyCandidate } from "@/lib/breezy-api";
import { extractCandidateResumeText } from "@/lib/recruiting-intelligence/resume-parser";
import { buildCandidateReadinessScore } from "@/lib/candidate-readiness/candidate-readiness-score";
import { buildQuestionnaireIntelligence } from "@/lib/candidate-readiness/questionnaire-parser";
import { buildResumeIntelligence } from "@/lib/candidate-readiness/resume-intelligence";
import type { CandidateIntelligenceBundle } from "@/lib/candidate-readiness/types";

export function buildCandidateIntelligenceBundle(candidate: BreezyCandidate): CandidateIntelligenceBundle {
  const resume = buildResumeIntelligence(candidate);
  const questionnaire = buildQuestionnaireIntelligence(candidate);
  const resumeHaystack = extractCandidateResumeText(candidate).toLowerCase();
  const grade = buildCandidateReadinessScore({
    candidate,
    resume,
    questionnaire,
    resumeHaystack,
  });

  return { resume, questionnaire, grade };
}
