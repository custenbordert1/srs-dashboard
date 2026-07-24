import {
  P214_MAX_COHORT_SIZE,
  type P214PreflightInput,
  type P214PreflightResult,
} from "@/lib/p214-unsent-test-batch/types";

export const P214_SEND_STATEMENT =
  "P214 will send up to 20 Dropbox Sign test-mode envelopes. These envelopes are not legally binding and do not count as production paperwork.";

/**
 * Mandatory preflight. Every failure is fatal: if test mode cannot be
 * positively verified — or production mode appears active — the send must
 * stop before any envelope is created.
 */
export function evaluateP214Preflight(input: P214PreflightInput): P214PreflightResult {
  const failures: string[] = [];

  if (!input.configPresent) failures.push("Dropbox Sign configuration missing");
  if (!input.testModeVerified) {
    failures.push("test_mode=true could not be positively verified");
  }
  if (input.nodeEnvIsProduction) {
    failures.push("production mode is active (NODE_ENV=production) — refusing");
  }
  if (!input.dropboxApiReachable) failures.push("Dropbox Sign API is not reachable");
  if (!input.templateConfigured) failures.push("Onboarding template is not configured");
  if (!input.templateFoundInAccount) {
    failures.push("Configured template was not found in the Dropbox Sign account");
  }
  if (!input.signerRoleValid) failures.push("Signer role / merge fields are not valid");
  if (input.cohortSize < 1) failures.push("Frozen cohort is empty — nothing to send");
  if (input.cohortSize > P214_MAX_COHORT_SIZE) {
    failures.push(`Cohort exceeds maximum of ${P214_MAX_COHORT_SIZE} candidates`);
  }
  if (input.membersWithNewEnvelopeSincePreview > 0) {
    failures.push(
      `${input.membersWithNewEnvelopeSincePreview} cohort member(s) acquired an envelope after the preview`,
    );
  }
  if (input.duplicateIdempotencyKeys > 0) {
    failures.push("Idempotency keys are not unique across the cohort");
  }
  if (input.continuousAutomationActive) {
    failures.push("A continuous paperwork automation runner is active — refusing");
  }

  return { ok: failures.length === 0, failures };
}
