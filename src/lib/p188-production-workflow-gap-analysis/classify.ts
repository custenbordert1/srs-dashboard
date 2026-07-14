import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { mapToLifecycleState } from "@/lib/p187-hr-to-oa-canary/adapter";
import type { P188LifecycleBucket } from "@/lib/p188-production-workflow-gap-analysis/types";

const BUCKET_ORDER: P188LifecycleBucket[] = [
  "Applied",
  "Recruiter Review",
  "Hiring Recommendation",
  "Operator Approved",
  "Paperwork Needed",
  "Paperwork Sent",
  "Viewed",
  "Signed",
  "Ready for MEL",
  "Exported",
  "Other",
];

export function redactId(id: string): string {
  const t = id.trim();
  if (t.length <= 8) return `${t.slice(0, 2)}…${t.slice(-2)}`;
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

export function emptyBucketCounts(): Record<P188LifecycleBucket, number> {
  return Object.fromEntries(BUCKET_ORDER.map((b) => [b, 0])) as Record<
    P188LifecycleBucket,
    number
  >;
}

/**
 * Map production workflow + paperwork signals to the P186/P187 lifecycle buckets
 * used for gap analysis (read-only).
 */
export function classifyFurthestLegitimateStage(
  wf: CandidateWorkflowRecord,
): P188LifecycleBucket {
  const paperwork = (wf.paperworkStatus ?? "not_sent").toLowerCase();
  const status = wf.workflowStatus;
  const approval = (wf.notes ?? []).some((n) =>
    /\[P190_OPERATOR_APPROVED\]|\[P187_OPERATOR_APPROVED\]|OPERATOR_APPROVED|operator approved/i.test(
      n,
    ),
  );

  if (status === "Loaded in MEL" || status === "Active Rep") return "Exported";
  if (status === "Ready for MEL") return "Ready for MEL";
  if (status === "Signed" || paperwork === "signed") return "Signed";
  if (paperwork === "viewed" || Boolean(wf.paperworkViewedAt)) return "Viewed";
  if (status === "Paperwork Sent" || paperwork === "sent") return "Paperwork Sent";
  if (status === "Paperwork Needed") return "Paperwork Needed";
  if (status === "Operator Approved") return "Operator Approved";

  const lifecycle = mapToLifecycleState({
    workflowStatus: status,
    recommendedStage: wf.recommendedStage ?? null,
    hasOperatorApprovalEvidence: approval,
  });

  if (lifecycle === "OPERATOR_APPROVED") return "Operator Approved";
  if (lifecycle === "HIRING_RECOMMENDATION") return "Hiring Recommendation";
  if (status === "Needs Review" || status === "Qualified") return "Recruiter Review";
  if (status === "Applied") return "Applied";
  if (status === "Not Qualified") return "Other";
  return "Other";
}

export function ageDays(iso: string | null | undefined, nowMs = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.round(((nowMs - t) / 86400000) * 10) / 10;
}

export function averageAgeDays(values: Array<number | null>): number | null {
  const nums = values.filter((n): n is number => typeof n === "number");
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export { BUCKET_ORDER };
