import type { P189OperatorQueueReport } from "@/lib/p189-recommend-hire-pilot/operatorQueue";

export type P189ReadinessForecast = {
  operatorApprovalReady: number;
  paperworkNeededForecast: number;
  p184QueueForecast: number;
  expectedPaperworkBatchSize: number;
  p187Enabled: false;
  paperworkSendEnabled: false;
  note: string;
};

/**
 * Readiness forecast only — does not enable P187 or paperwork send.
 */
export function buildP189ReadinessForecast(input: {
  operatorQueue: P189OperatorQueueReport;
}): P189ReadinessForecast {
  const oaReady = input.operatorQueue.readyForOperatorApproval;
  return {
    operatorApprovalReady: oaReady,
    // After OA (future phase), all ready OA candidates become Paperwork Needed forecast.
    paperworkNeededForecast: oaReady,
    p184QueueForecast: oaReady,
    expectedPaperworkBatchSize: oaReady,
    p187Enabled: false,
    paperworkSendEnabled: false,
    note:
      "Forecast only. P189 stopped after Recommend Hire. No OA, no P184 send, no P187.",
  };
}

export function buildP189ReadinessReportMarkdown(input: {
  cohortId: string;
  fingerprint: string;
  successful: number;
  failed: number;
  operatorQueue: P189OperatorQueueReport;
  forecast: P189ReadinessForecast;
  validationOk: boolean;
  testsStatus: string;
  buildStatus: string;
}): string {
  return `# P189 Readiness Report

## Cohort
- Cohort ID: \`${input.cohortId}\`
- Fingerprint: \`${input.fingerprint}\`
- Recommend Hire successful: **${input.successful}**
- Failed: **${input.failed}**

## Operator Approval Queue
- Recommendation count: ${input.operatorQueue.recommendationCount}
- Ready for operator approval: **${input.operatorQueue.readyForOperatorApproval}**
- Blocked: ${input.operatorQueue.blocked}
- Conflicts: ${input.operatorQueue.conflicts}
- Duplicates: ${input.operatorQueue.duplicates}

## Forecast (no sends)
- Operator Approval ready: ${input.forecast.operatorApprovalReady}
- Paperwork Needed forecast: ${input.forecast.paperworkNeededForecast}
- P184 queue forecast: ${input.forecast.p184QueueForecast}
- Expected paperwork batch size: ${input.forecast.expectedPaperworkBatchSize}
- P187 enabled: false
- Paperwork send enabled: false

## Validation / Tests
- Lifecycle integrity: ${input.validationOk ? "ok" : "issues"}
- Tests: ${input.testsStatus}
- Build: ${input.buildStatus}

## Exact next operator action
Review the Operator Approval queue (\`artifacts/p189-operator-queue.json\`) and manually approve candidates **one-by-one or via a future authorized P190 phase**. Do **not** send paperwork in this phase. Do **not** enable P187.
`;
}
