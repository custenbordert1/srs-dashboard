import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";

export const DEFAULT_PAPERWORK_BY_GRADE: PaperworkByGrade = {
  "A+": true,
  A: true,
  B: true,
  C: true,
  D: true,
};

export function isGradeAllowedForPaperwork(
  grade: AiLetterGrade,
  paperworkByGrade: PaperworkByGrade,
): boolean {
  return paperworkByGrade[grade] ?? false;
}
