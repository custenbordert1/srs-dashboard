import { P188_1_RECOMMENDED_STAGE } from "@/lib/p188-1-hiring-recommendation-workflow/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P190_OPERATOR_APPROVED_STATUS,
  type P190ExecutionResult,
  type P190FrozenCohort,
} from "@/lib/p190-operator-approval-pilot/types";

export type P190PostValidation = {
  approvalsWritten: number;
  auditEventsWritten: number;
  p186ObservedEvents: number;
  duplicateApprovals: number;
  failedWrites: number;
  ownershipPreserved: number;
  ownershipDrift: number;
  paperworkCreated: number;
  dropboxSignSends: number;
  melExports: number;
  lifecycleIntegrityOk: boolean;
  queueReadyForPaperworkNeeded: number;
  details: string[];
};

export function validateP190Execution(input: {
  cohort: P190FrozenCohort;
  result: P190ExecutionResult;
  workflowsById: Map<string, CandidateWorkflowRecord>;
}): P190PostValidation {
  const details: string[] = [];
  let approvalsWritten = 0;
  let ownershipPreserved = 0;
  let ownershipDrift = 0;
  let paperworkCreated = 0;
  let queueReady = 0;

  for (const member of input.cohort.members) {
    const attempt = input.result.attempts.find((a) => a.candidateId === member.candidateId);
    if (!attempt?.ok) continue;
    const wf = input.workflowsById.get(member.candidateId);
    if (!wf) {
      details.push(`missing workflow after success: ${member.candidateId}`);
      continue;
    }
    if (wf.workflowStatus === P190_OPERATOR_APPROVED_STATUS) {
      approvalsWritten += 1;
    } else {
      details.push(`status not OA for ${member.candidateId}: ${wf.workflowStatus}`);
    }
    if (wf.assignedRecruiter === member.recruiter) ownershipPreserved += 1;
    else {
      ownershipDrift += 1;
      details.push(`ownership drift ${member.candidateId}`);
    }
    if (
      wf.workflowStatus === "Paperwork Needed" ||
      (wf.paperworkStatus && wf.paperworkStatus !== "not_sent")
    ) {
      paperworkCreated += 1;
    }
    if (
      wf.workflowStatus === P190_OPERATOR_APPROVED_STATUS &&
      wf.recommendedStage === P188_1_RECOMMENDED_STAGE &&
      wf.paperworkStatus === "not_sent"
    ) {
      queueReady += 1;
    }
  }

  const lifecycleIntegrityOk =
    ownershipDrift === 0 &&
    paperworkCreated === 0 &&
    input.result.paperworkCreated === 0 &&
    input.result.dropboxSignSends === 0 &&
    input.result.melExports === 0;

  return {
    approvalsWritten,
    auditEventsWritten: input.result.auditEvents,
    p186ObservedEvents: input.result.p186Observations,
    duplicateApprovals: input.result.duplicateApprovals,
    failedWrites: input.result.failed,
    ownershipPreserved,
    ownershipDrift,
    paperworkCreated,
    dropboxSignSends: input.result.dropboxSignSends,
    melExports: input.result.melExports,
    lifecycleIntegrityOk,
    queueReadyForPaperworkNeeded: queueReady,
    details,
  };
}

export type P190ReadinessForecast = {
  queueReadyForPaperworkNeeded: number;
  paperworkNeededForecast: number;
  p184QueueForecast: number;
  paperworkSendEnabled: false;
  p187Enabled: false;
  automationStatus: "off";
  p184Mode: string;
  note: string;
};

export function buildP190ReadinessForecast(input: {
  queueReadyForPaperworkNeeded: number;
  p184Mode: string;
}): P190ReadinessForecast {
  return {
    queueReadyForPaperworkNeeded: input.queueReadyForPaperworkNeeded,
    paperworkNeededForecast: input.queueReadyForPaperworkNeeded,
    p184QueueForecast: input.queueReadyForPaperworkNeeded,
    paperworkSendEnabled: false,
    p187Enabled: false,
    automationStatus: "off",
    p184Mode: input.p184Mode,
    note:
      "Forecast only. P190 stopped after Operator Approved. Do not create Paperwork Needed without explicit authorization.",
  };
}

export function buildP190ReadinessReportMarkdown(input: {
  cohortId: string;
  fingerprint: string;
  sourceCohortId: string;
  attempted: number;
  successful: number;
  failed: number;
  auditEvents: number;
  p186Observations: number;
  duplicateApprovals: number;
  paperworkCreated: number;
  dropboxSignSends: number;
  melExports: number;
  automationStatus: string;
  p184Mode: string;
  queueReadyForPaperworkNeeded: number;
  testsStatus: string;
}): string {
  return `# P190 Readiness Report

## Cohort
- Cohort ID: \`${input.cohortId}\`
- Fingerprint: \`${input.fingerprint}\`
- Source P189 cohort: \`${input.sourceCohortId}\`

## Execution
- Attempted: **${input.attempted}**
- Successful: **${input.successful}**
- Failed: **${input.failed}**
- Audit events: ${input.auditEvents}
- P186 observations: ${input.p186Observations}
- Duplicate approvals: ${input.duplicateApprovals}

## Safety (must remain zero)
- Paperwork created: **${input.paperworkCreated}**
- Dropbox Sign sends: **${input.dropboxSignSends}**
- MEL exports: **${input.melExports}**
- Automation status: **${input.automationStatus}**
- P184 mode: **${input.p184Mode}**

## Next queue
- Queue now ready for Paperwork Needed: **${input.queueReadyForPaperworkNeeded}**

## Tests
- ${input.testsStatus}

## Exact next operator action
Do **not** create Paperwork Needed, call P184, enable P187, or start P191 automatically. Wait for **explicit operator authorization** before any paperwork is created.
`;
}
