import { fetchBreezyJobs } from "@/lib/breezy-api";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { detectLegacyPaperworkBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-legacy-paperwork-blockers";
import type {
  P1544ClassificationReport,
  P1544ClassificationRow,
  P1544EligibilityBucket,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/types";

function parseAppliedDate(candidate: BreezyCandidate): number {
  const raw = candidate.addedDate || candidate.appliedDate;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function candidateSince(sinceIso: string, candidate: BreezyCandidate): boolean {
  const sinceMs = Date.parse(`${sinceIso}T00:00:00.000Z`);
  const appliedMs = parseAppliedDate(candidate);
  if (appliedMs > 0) return appliedMs >= sinceMs;
  return true;
}

function emptyBuckets(): Record<P1544EligibilityBucket, number> {
  return {
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
  };
}

function mapHardBlockerToBucket(
  blocker: import("@/lib/p152-immediate-paperwork-policy/types").ImmediatePaperworkHardBlocker | null,
): P1544EligibilityBucket {
  switch (blocker) {
    case "unassigned_recruiter":
      return "needs_recruiter_assignment";
    case "invalid_email":
      return "invalid_email";
    case "duplicate_candidate":
      return "duplicate";
    case "paperwork_already_completed":
      return "already_signed";
    case "active_signature_request":
      return "active_signature_request";
    case "paperwork_already_sent":
      return "already_sent";
    case "disqualified_candidate":
    case "archived_candidate":
      return "disqualified_archived";
    default:
      return "do_not_send";
  }
}

export async function classifyCandidatesSince(input: {
  backfillSince: string;
  maxRows?: number;
}): Promise<P1544ClassificationReport> {
  const store = await readIngestionStore();
  const candidates = listIngestedCandidates(store).filter((c) =>
    candidateSince(input.backfillSince, c),
  );
  const bundle = await getCandidateWorkflowBundle();
  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const auditEvents = await loadPaperworkAutomationAuditLog();
  const jobsResult = await fetchBreezyJobs("published");
  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );

  const buckets = emptyBuckets();
  const rows: P1544ClassificationRow[] = [];

  for (const candidate of candidates) {
    const workflow = bundle.workflows[candidate.candidateId];
    const onboarding = onboardingByCandidate.get(candidate.candidateId) ?? null;
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const hard = detectImmediatePaperworkHardBlockers({
      row,
      candidate,
      onboarding,
      auditEvents,
    });

    let bucket: P1544EligibilityBucket;
    let reason: string;

    if (hard.blocked) {
      bucket = mapHardBlockerToBucket(hard.primaryHardBlocker);
      reason = hard.blockers[0] ?? bucket;
    } else {
      const legacy = detectLegacyPaperworkBlockers({
        row,
        jobsByPositionId,
        onboarding,
        auditEvents,
        referenceMs: Date.now(),
      });
      bucket = "eligible_for_paperwork";
      reason =
        legacy.codes.length > 0
          ? `Eligible under P152 (legacy gates bypassed: ${legacy.labels.slice(0, 3).join("; ")}).`
          : "Eligible under P152 immediate paperwork policy.";
    }

    buckets[bucket] += 1;
    if (!input.maxRows || rows.length < input.maxRows) {
      rows.push({
        candidateId: candidate.candidateId,
        candidateName:
          `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.candidateId,
        bucket,
        reason,
      });
    }
  }

  return {
    backfillSince: input.backfillSince,
    totalClassified: candidates.length,
    buckets,
    rows,
  };
}
