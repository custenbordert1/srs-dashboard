export {
  P103_PREVIEW_MODE,
  P103_SOURCE_PHASE,
} from "@/lib/test-cohort-validation/types";
export type {
  ApplicantValidationResult,
  TestCohortApplicant,
  TestCohortValidationMetrics,
  TestCohortValidationReport,
} from "@/lib/test-cohort-validation/types";
export { P103_TEST_APPLICANTS } from "@/lib/test-cohort-validation/test-applicants";
export {
  matchTestApplicantToCandidates,
  resolveBestApplicantMatch,
  scoreApplicantMatch,
} from "@/lib/test-cohort-validation/match-test-applicant";
export {
  normalizePhoneDigits,
  validateCohortEmail,
  validateCohortPhone,
} from "@/lib/test-cohort-validation/validate-cohort-contact";
export { buildApplicantValidationResult } from "@/lib/test-cohort-validation/build-applicant-validation";
export {
  buildTestCohortValidation,
  buildTestCohortValidationFromStores,
} from "@/lib/test-cohort-validation/build-test-cohort-validation";
