import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  ageDays,
  averageAgeDays,
  classifyFurthestLegitimateStage,
  emptyBucketCounts,
  redactId,
  BUCKET_ORDER,
} from "@/lib/p188-production-workflow-gap-analysis/classify";
import type {
  P188CandidateClassification,
  P188HiringRecommendationGap,
  P188LifecycleBucket,
  P188StageStats,
} from "@/lib/p188-production-workflow-gap-analysis/types";

const STAGE_META: Record<
  P188LifecycleBucket,
  Omit<P188StageStats, "stage" | "totalCandidates" | "averageAgeDays">
> = {
  Applied: {
    candidatesEnteringHint: "Breezy/ingestion → workflow seed Applied",
    candidatesExitingHint: "Manual status change, Needs Review, or onboarding reconcile jump",
    stageOwner: "Recruiter / ingestion",
    productionWriter: "candidate-workflow-store / ingestion backfill",
    apiResponsible: "GET/POST /api/candidates/workflows + ingestion",
    workflowResponsible: "upsertCandidateWorkflow; candidate ingestion backfill",
    expectedNextTransition: "Applied → Recruiter Review",
  },
  "Recruiter Review": {
    candidatesEnteringHint: "Status Needs Review / Qualified or recruiter open",
    candidatesExitingHint: "Recommendation / reject / hold",
    stageOwner: "Recruiter",
    productionWriter: "api-candidates-workflows",
    apiResponsible: "POST /api/candidates/workflows",
    workflowResponsible: "upsertCandidateWorkflow(workflowStatus)",
    expectedNextTransition: "Recruiter Review → Hiring Recommendation",
  },
  "Hiring Recommendation": {
    candidatesEnteringHint: "Persisted recommendedStage hire/recommend/paperwork signal",
    candidatesExitingHint: "Operator approval (P187 target)",
    stageOwner: "Recruiter → Operator",
    productionWriter: "progression/advancement → upsert recommendedStage",
    apiResponsible: "POST /api/candidates/workflows/auto-progression; P83/P151 apply paths",
    workflowResponsible: "applyCandidateProgressions / applyCandidateAdvancements",
    expectedNextTransition: "Hiring Recommendation → Operator Approved",
  },
  "Operator Approved": {
    candidatesEnteringHint: "Operator approval evidence / P186.3 approval adapter",
    candidatesExitingHint: "Advance to Paperwork Needed",
    stageOwner: "Operator / executive",
    productionWriter: "p186-3 / api-candidates-workflows / p97",
    apiResponsible: "P186 operator queues; workflows upsert",
    workflowResponsible: "executeOperatorApprovalAction (often jumps to Paperwork Needed)",
    expectedNextTransition: "Operator Approved → Paperwork Needed",
  },
  "Paperwork Needed": {
    candidatesEnteringHint: "Approval or P83 send-paperwork advance",
    candidatesExitingHint: "P184/P185 send",
    stageOwner: "P184/P185 paperwork subsystem",
    productionWriter: "P185 runner → P184 sender",
    apiResponsible: "P185 production automation APIs",
    workflowResponsible: "recordCandidatePaperworkSent / onboarding send",
    expectedNextTransition: "Paperwork Needed → Paperwork Sent",
  },
  "Paperwork Sent": {
    candidatesEnteringHint: "Send success or onboarding reconcile(sent)",
    candidatesExitingHint: "Viewed / signed webhooks",
    stageOwner: "Dropbox Sign + workflow reconcile",
    productionWriter: "onboarding reconciliation / paperwork status apply",
    apiResponsible: "webhooks + workflow reconcile",
    workflowResponsible: "reconcileWorkflowFromOnboarding; applyCandidatePaperwork*",
    expectedNextTransition: "Paperwork Sent → Viewed",
  },
  Viewed: {
    candidatesEnteringHint: "Dropbox viewed / reconcile(viewed)",
    candidatesExitingHint: "Signed",
    stageOwner: "Dropbox Sign",
    productionWriter: "paperwork viewed apply",
    apiResponsible: "Dropbox webhook handlers",
    workflowResponsible: "applyCandidatePaperworkViewed",
    expectedNextTransition: "Viewed → Signed",
  },
  Signed: {
    candidatesEnteringHint: "All signed / reconcile(ready_for_mel→Signed mapping)",
    candidatesExitingHint: "Onboarding complete / Ready for MEL",
    stageOwner: "Post-sign / MEL queue (P186.5 observe)",
    productionWriter: "workflow store + P186.5 review",
    apiResponsible: "signed webhook; P186.5 actions",
    workflowResponsible: "applyCandidatePaperworkSigned",
    expectedNextTransition: "Signed → Ready for MEL",
  },
  "Ready for MEL": {
    candidatesEnteringHint: "Operator MEL readiness approval",
    candidatesExitingHint: "External MEL export observe",
    stageOwner: "Operator / MEL ops",
    productionWriter: "workflow Ready for MEL",
    apiResponsible: "workflows upsert; P186.5 queue",
    workflowResponsible: "upsertCandidateWorkflow(Ready for MEL)",
    expectedNextTransition: "Ready for MEL → Exported",
  },
  Exported: {
    candidatesEnteringHint: "Loaded in MEL / Active Rep",
    candidatesExitingHint: "Terminal",
    stageOwner: "MEL / field ops",
    productionWriter: "workflow status",
    apiResponsible: "workflows upsert / MEL observe",
    workflowResponsible: "upsertCandidateWorkflow",
    expectedNextTransition: "Terminal / monitor",
  },
  Other: {
    candidatesEnteringHint: "Not Qualified / unknown",
    candidatesExitingHint: "n/a",
    stageOwner: "Recruiter",
    productionWriter: "workflows upsert",
    apiResponsible: "POST /api/candidates/workflows",
    workflowResponsible: "upsertCandidateWorkflow",
    expectedNextTransition: "None / re-open",
  },
};

export function buildStageStats(
  workflows: CandidateWorkflowRecord[],
  nowMs = Date.now(),
): {
  stageDistribution: Record<P188LifecycleBucket, number>;
  furthestStageCounts: Record<P188LifecycleBucket, number>;
  stageStats: P188StageStats[];
  classifications: P188CandidateClassification[];
} {
  const stageDistribution = emptyBucketCounts();
  const furthestStageCounts = emptyBucketCounts();
  const agesByBucket: Record<P188LifecycleBucket, Array<number | null>> = Object.fromEntries(
    BUCKET_ORDER.map((b) => [b, [] as Array<number | null>]),
  ) as Record<P188LifecycleBucket, Array<number | null>>;

  const classifications: P188CandidateClassification[] = [];

  for (const wf of workflows) {
    const furthest = classifyFurthestLegitimateStage(wf);
    furthestStageCounts[furthest] += 1;

    // Production status bucket (raw) for distribution vs furthest
    let rawBucket: P188LifecycleBucket = "Other";
    if (wf.workflowStatus === "Applied") rawBucket = "Applied";
    else if (wf.workflowStatus === "Needs Review" || wf.workflowStatus === "Qualified") {
      rawBucket = "Recruiter Review";
    } else if (wf.workflowStatus === "Paperwork Needed") rawBucket = "Paperwork Needed";
    else if (wf.workflowStatus === "Paperwork Sent") rawBucket = "Paperwork Sent";
    else if (wf.workflowStatus === "Signed") rawBucket = "Signed";
    else if (wf.workflowStatus === "Ready for MEL") rawBucket = "Ready for MEL";
    else if (wf.workflowStatus === "Loaded in MEL" || wf.workflowStatus === "Active Rep") {
      rawBucket = "Exported";
    }
    // Viewed may still show Paperwork Sent in status
    if ((wf.paperworkStatus ?? "") === "viewed" && rawBucket === "Paperwork Sent") {
      rawBucket = "Viewed";
    }
    stageDistribution[rawBucket] += 1;

    const age = ageDays(wf.updatedAt ?? wf.lastActionAt, nowMs);
    agesByBucket[furthest].push(age);

    const blocks: string[] = [];
    if (!wf.recommendedStage?.trim()) blocks.push("missing_recommendation_evidence");
    if (!wf.assignedRecruiter || wf.assignedRecruiter === "Unassigned") {
      blocks.push("unresolved_owner");
    }
    if (!(wf as { jobId?: string }).jobId) blocks.push("unresolved_job");
    if (!wf.lastActionAt && wf.workflowStatus === "Applied") {
      blocks.push("missing_recruiter_action");
    }

    classifications.push({
      redactedCandidateId: redactId(wf.candidateId),
      productionWorkflowStatus: wf.workflowStatus,
      furthestLegitimateStage: furthest,
      ageDays: age,
      assignedRecruiter: wf.assignedRecruiter || "Unassigned",
      recommendedStage: wf.recommendedStage ?? null,
      paperworkStatus: wf.paperworkStatus ?? null,
      blockReasons: blocks,
    });
  }

  const stageStats: P188StageStats[] = BUCKET_ORDER.map((stage) => ({
    stage,
    totalCandidates: furthestStageCounts[stage],
    averageAgeDays: averageAgeDays(agesByBucket[stage]),
    ...STAGE_META[stage],
  }));

  return { stageDistribution, furthestStageCounts, stageStats, classifications };
}

export function buildHiringRecommendationGaps(
  workflows: CandidateWorkflowRecord[],
  nowMs = Date.now(),
): {
  gaps: P188HiringRecommendationGap[];
  hiringRecommendationCount: number;
  explanations: string[];
} {
  const gaps: P188HiringRecommendationGap[] = [];
  let hiringRecommendationCount = 0;

  for (const wf of workflows) {
    const furthest = classifyFurthestLegitimateStage(wf);
    if (furthest === "Hiring Recommendation") {
      hiringRecommendationCount += 1;
      continue;
    }

    // Focus gap analysis on pre-paperwork candidates that never reached HR
    if (
      furthest === "Paperwork Sent" ||
      furthest === "Viewed" ||
      furthest === "Signed" ||
      furthest === "Ready for MEL" ||
      furthest === "Exported"
    ) {
      // Still note they skipped HR
      gaps.push({
        redactedCandidateId: redactId(wf.candidateId),
        missingRecommendationEvidence: !wf.recommendedStage?.trim(),
        missingRecruiterAction: true,
        missingApiCall: true,
        missingWorkflowTransition: true,
        unresolvedJob: true,
        unresolvedOwner:
          !wf.assignedRecruiter || wf.assignedRecruiter === "Unassigned",
        staleWorkflow: false,
        missingStateMapping: true,
        lifecycleBug: false,
        expectedBehavior:
          "Pass through Recruiter Review → Hiring Recommendation → Operator Approved → Paperwork Needed before send",
        actualBehavior: `Reached ${furthest} via onboarding/paperwork path without persisted Hiring Recommendation`,
      });
      continue;
    }

    const age = ageDays(wf.updatedAt ?? wf.lastActionAt, nowMs);
    const stale = age != null && age > 14;
    gaps.push({
      redactedCandidateId: redactId(wf.candidateId),
      missingRecommendationEvidence: !wf.recommendedStage?.trim(),
      missingRecruiterAction:
        !wf.lastActionAt ||
        !(
          wf.recruitingActions &&
          [
            wf.recruitingActions.dmReview,
            wf.recruitingActions.recommendInterview,
            wf.recruitingActions.needsFollowUp,
            wf.recruitingActions.priorityList,
            wf.recruitingActions.onboardingPacketPrep,
          ].some(Boolean)
        ),
      missingApiCall: !wf.recommendedStage?.trim(),
      missingWorkflowTransition:
        wf.workflowStatus === "Applied" || wf.workflowStatus === "Needs Review",
      unresolvedJob: true,
      unresolvedOwner: !wf.assignedRecruiter || wf.assignedRecruiter === "Unassigned",
      staleWorkflow: stale,
      missingStateMapping:
        wf.workflowStatus !== "Qualified" && !wf.recommendedStage?.trim(),
      lifecycleBug: false,
      expectedBehavior:
        "Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION",
      actualBehavior: `Stuck at production status ${wf.workflowStatus} / furthest ${furthest}; recommendedStage=${wf.recommendedStage ?? "null"}`,
    });
  }

  const explanations = [
    "Production workflowStatus enum has no 'Hiring Recommendation' value — HR is a P186 shadow stage derived from recommendedStage (+ not past Operator Approved).",
    "Persisted recommendedStage count is zero across the scanned store — P187 eligibility requires recommendation evidence.",
    "Candidate progression engine can write recommendedStage via POST /api/candidates/workflows/auto-progression, but labels are Contact/Interview/Send Paperwork/etc., and the batch has not populated the store (0 rows).",
    "UI enrichment in build-candidate-workflow-row attaches progression in-memory (display_only) without durable write.",
    "P83 applyCandidateAdvancements can set recommendedStage but live P151 advancement remains flag-gated; send-paperwork path jumps to Paperwork Needed, skipping Operator Approved.",
    "Onboarding reconciliation frequently advances Applied → Paperwork Sent / Signed, bypassing mid-funnel stages (Qualified, Paperwork Needed, Hiring Recommendation).",
    "All scanned candidates have assignedRecruiter=Unassigned — P187 also requires resolved operator owner.",
    "Workflow records lack durable job assignment fields — P187 jobAssignmentResolved fails closed.",
  ];

  return { gaps, hiringRecommendationCount, explanations };
}
