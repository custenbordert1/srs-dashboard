import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { classifyCandidatesSince } from "@/lib/p154-full-candidate-backfill-continuous-processing/classify-candidates";
import type { P1544ClassificationReport } from "@/lib/p154-full-candidate-backfill-continuous-processing/types";
import { buildP1547AutopilotStatus } from "@/lib/p154-continuous-autonomous-recruiting-runner/build-autopilot-status";
import { getP154BackfillSinceDate } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { P159_SERVER_CLASSIFICATION_TIMEOUT_MS } from "@/lib/p159-operations-control-center/constants";
import { withServerTimeout } from "@/lib/p155-autopilot-operations-dashboard/request-timeout";
import type { P159TodayActivitySection } from "@/lib/p159-operations-control-center/types";
import { buildP159BatchHistory } from "@/lib/p159-operations-control-center/build-batch-history";

function todayStartMs(): number {
  return Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export async function buildP159TodayActivity(): Promise<P159TodayActivitySection> {
  const startMs = todayStartMs();
  const [audit, bundle, p1547, { sendBatches }] = await Promise.all([
    loadPaperworkAutomationAuditLog(),
    getCandidateWorkflowBundle(),
    buildP1547AutopilotStatus(),
    buildP159BatchHistory(),
  ]);

  const todaySends = audit.filter(
    (e) => e.sendResult === "sent" && e.executed === true && Date.parse(e.at) >= startMs,
  );
  const todayDuplicates = audit.filter(
    (e) => e.duplicatePrevented === true && Date.parse(e.at) >= startMs,
  );

  let signedToday = 0;
  let viewedToday = 0;
  let pendingSignatures = 0;

  for (const record of Object.values(bundle.workflows)) {
    if (record.paperworkStatus === "signed" && record.paperworkSignedAt) {
      if (Date.parse(record.paperworkSignedAt) >= startMs) signedToday += 1;
    }
    if (record.paperworkStatus === "viewed") viewedToday += 1;
    if (
      record.signatureRequestId &&
      (record.paperworkStatus === "sent" ||
        record.paperworkStatus === "viewed" ||
        record.workflowStatus === "Paperwork Sent")
    ) {
      pendingSignatures += 1;
    }
  }

  const paperworkSent = Math.max(p1547.todaysSends, todaySends.length, sendBatches.reduce((s, b) => s + b.sendCount, 0));

  return {
    paperworkSent,
    sendBatchCount: sendBatches.length,
    sendBatches,
    signedToday: Math.max(p1547.todaysSignatures, signedToday),
    viewedToday,
    pendingSignatures,
    duplicatesPrevented: todayDuplicates.length,
    failures: 0,
  };
}

function emptyClassification(backfillSince: string): P1544ClassificationReport {
  return {
    backfillSince,
    totalClassified: 0,
    buckets: {
      eligible_for_paperwork: 0,
      already_sent: 0,
      active_signature_request: 0,
      already_signed: 0,
      duplicate: 0,
      invalid_email: 0,
      disqualified_archived: 0,
      needs_recruiter_assignment: 0,
      manual_review: 0,
      do_not_send: 0,
    },
    rows: [],
  };
}

export async function buildP159QueueStatus(input?: {
  failures?: number;
}): Promise<{
  queue: import("@/lib/p159-operations-control-center/types").P159QueueStatusSection;
  candidatesEvaluated: number;
  warnings: string[];
}> {
  const backfillSince = getP154BackfillSinceDate();
  const warnings: string[] = [];

  const classificationResult = await withServerTimeout({
    label: "P159 candidate classification",
    promise: classifyCandidatesSince({ backfillSince, maxRows: 0 }),
    timeoutMs: P159_SERVER_CLASSIFICATION_TIMEOUT_MS,
    fallback: emptyClassification(backfillSince),
  });

  let classification = classificationResult.value;
  if (classificationResult.timedOut || classificationResult.error) {
    warnings.push(
      classificationResult.error ??
        "Queue classification timed out — counts may be incomplete.",
    );
  }

  const bundle = await getCandidateWorkflowBundle();
  let readyAfterWorkflowTransition = 0;
  for (const row of classification.rows) {
    if (row.bucket !== "manual_review") continue;
    const reason = row.reason.toLowerCase();
    if (
      reason.includes("paperwork needed") ||
      reason.includes("send-paperwork") ||
      reason.includes("workflowstatus")
    ) {
      readyAfterWorkflowTransition += 1;
    }
  }

  const queueRemaining = Object.values(bundle.workflows).filter(
    (r) =>
      !isUnassignedRecruiter(r.assignedRecruiter) &&
      r.paperworkStatus !== "signed" &&
      r.paperworkStatus !== "sent" &&
      !["Not Qualified", "Active Rep", "Loaded in MEL"].includes(r.workflowStatus),
  ).length;

  const blocked =
    classification.buckets.manual_review +
    classification.buckets.do_not_send +
    classification.buckets.disqualified_archived;

  return {
    warnings,
    candidatesEvaluated: classification.totalClassified,
    queue: {
      candidatesEvaluated: classification.totalClassified,
      eligibleNow: classification.buckets.eligible_for_paperwork,
      readyAfterRecruiterAssignment: classification.buckets.needs_recruiter_assignment,
      readyAfterWorkflowTransition,
      waitingOnSignature:
        classification.buckets.active_signature_request + classification.buckets.already_sent,
      alreadySent: classification.buckets.already_sent,
      alreadySigned: classification.buckets.already_signed,
      duplicates: classification.buckets.duplicate,
      invalidEmails: classification.buckets.invalid_email,
      manualReview: classification.buckets.manual_review,
      blocked,
      queueRemaining,
    },
  };
}
