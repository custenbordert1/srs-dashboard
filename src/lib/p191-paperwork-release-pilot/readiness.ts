import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type {
  P191ExecutionResult,
  P191FrozenCohort,
} from "@/lib/p191-paperwork-release-pilot/types";

export type P191EnvelopeValidation = {
  candidateId: string;
  envelopeId: string | null;
  confirmedSent: boolean;
  exactlyOneEnvelope: boolean;
  duplicatePaperwork: boolean;
  recruiterPreserved: boolean;
  workflowAdvanced: boolean;
  paperworkStatus: string | null;
  workflowStatus: string | null;
};

export type P191PostValidation = {
  envelopes: P191EnvelopeValidation[];
  confirmedSentCount: number;
  duplicateEnvelopes: number;
  ownershipPreserved: number;
  ownershipDrift: number;
  queueRemaining: number;
  lifecycleIntegrityOk: boolean;
  details: string[];
};

export function validateP191Execution(input: {
  cohort: P191FrozenCohort;
  result: P191ExecutionResult;
  workflowsById: Map<string, CandidateWorkflowRecord>;
}): P191PostValidation {
  const details: string[] = [];
  const envelopes: P191EnvelopeValidation[] = [];
  let confirmedSentCount = 0;
  let duplicateEnvelopes = 0;
  let ownershipPreserved = 0;
  let ownershipDrift = 0;

  for (const member of input.cohort.members) {
    const attempt = input.result.attempts.find((a) => a.candidateId === member.candidateId);
    const wf = input.workflowsById.get(member.candidateId);
    if (!attempt?.ok) continue;
    if (!wf) {
      details.push(`missing workflow after success: ${member.candidateId}`);
      continue;
    }

    const envelopeId = wf.signatureRequestId ?? attempt.envelopeId;
    const exactlyOne = Boolean(envelopeId) && wf.signatureRequestId === envelopeId;
    const duplicate = Boolean(wf.signatureRequestId) && Boolean(attempt.envelopeId) &&
      wf.signatureRequestId !== attempt.envelopeId;
    if (duplicate) duplicateEnvelopes += 1;
    const recruiterOk = wf.assignedRecruiter === member.recruiter;
    if (recruiterOk) ownershipPreserved += 1;
    else {
      ownershipDrift += 1;
      details.push(`ownership drift ${member.candidateId}`);
    }
    const advanced =
      wf.workflowStatus === "Paperwork Sent" || wf.paperworkStatus === "sent";
    if (attempt.confirmedSent) confirmedSentCount += 1;

    envelopes.push({
      candidateId: member.candidateId,
      envelopeId,
      confirmedSent: attempt.confirmedSent,
      exactlyOneEnvelope: exactlyOne,
      duplicatePaperwork: duplicate,
      recruiterPreserved: recruiterOk,
      workflowAdvanced: advanced,
      paperworkStatus: wf.paperworkStatus ?? null,
      workflowStatus: wf.workflowStatus ?? null,
    });
  }

  const queueRemaining = input.cohort.members.length - input.result.successful;
  const lifecycleIntegrityOk =
    ownershipDrift === 0 &&
    duplicateEnvelopes === 0 &&
    input.result.melExports === 0 &&
    input.result.finalP184Mode === "dry_run";

  return {
    envelopes,
    confirmedSentCount,
    duplicateEnvelopes,
    ownershipPreserved,
    ownershipDrift,
    queueRemaining,
    lifecycleIntegrityOk,
    details,
  };
}

export function buildP191ReadinessReportMarkdown(input: {
  cohortId: string;
  fingerprint: string;
  sourceCohortId: string;
  attempted: number;
  successful: number;
  failed: number;
  confirmedDropboxSignSends: number;
  duplicateEnvelopes: number;
  auditEvents: number;
  p186Observations: number;
  finalP184Mode: string;
  automationStatus: string;
  queueRemaining: number;
  viewed: number;
  signed: number;
  failedEnvelopes: number;
  testsStatus: string;
}): string {
  return `# P191 Readiness Report

## Cohort
- Cohort ID: \`${input.cohortId}\`
- Fingerprint: \`${input.fingerprint}\`
- Source P190 cohort: \`${input.sourceCohortId}\`

## Execution
- Attempted: **${input.attempted}**
- Successful: **${input.successful}**
- Failed: **${input.failed}**
- Confirmed Dropbox Sign sends: **${input.confirmedDropboxSignSends}**
- Duplicate envelopes: **${input.duplicateEnvelopes}**
- Audit events: ${input.auditEvents}
- P186 observations: ${input.p186Observations}

## Safety
- Final P184 mode: **${input.finalP184Mode}**
- Automation status: **${input.automationStatus}**
- MEL exports: **0**

## Envelope funnel
- Queue remaining: ${input.queueRemaining}
- Viewed: ${input.viewed}
- Signed: ${input.signed}
- Failed envelopes: ${input.failedEnvelopes}

## Tests
- ${input.testsStatus}

## Stop
P191 complete. Do not enable continuous automation, scheduler, or P187. Do not process additional paperwork beyond this cohort.
`;
}
