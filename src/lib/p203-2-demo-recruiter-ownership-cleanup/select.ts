import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { isHistoricalApplicant } from "@/lib/candidate-ingestion/candidate-queue-scope";
import { getTerritoryEligibleRecruiters } from "@/lib/recruiter-assignment-engine/recruiter-territory-eligibility";
import {
  DEMO_RECRUITER_NAMES,
  isDemoRecruiterName,
  buildProductionRecruiterSelectorOptions,
  readProductionRecruiterDirectoryFromEnv,
} from "@/lib/production-recruiter-directory";
import type { P1884LedgerEvent } from "@/lib/p188-4-recruiter-ownership-durability/types";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import {
  ownershipIdempotencyKey,
  pickLatestValidLedgerEvidence,
  pickLatestValidP158Evidence,
  redactedCandidateId,
  type ValidOwnershipEvidence,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/evidence";
import {
  P203_2_MAX_BATCH,
  P203_2_PRODUCTION_POLICY,
  type P2032AuditCounts,
  type P2032Classification,
  type P2032Confidence,
  type P2032OperatorLocalRow,
  type P2032PreviewRow,
  type P2032ReplacementSource,
  type P2032StatusBucket,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/types";

const ARCHIVED_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);
const PAPERWORK_PENDING = new Set(["Paperwork Needed"]);
const PAPERWORK_SENT = new Set(["Paperwork Sent"]);
const SIGNED = new Set(["Signed"]);

function statusBuckets(
  wf: CandidateWorkflowRecord,
  candidate: BreezyCandidate | undefined,
): P2032StatusBucket[] {
  const buckets: P2032StatusBucket[] = ["workflow"];
  if (candidate) buckets.push("ingestion");
  if (ARCHIVED_STATUSES.has(wf.workflowStatus)) {
    buckets.push("archived");
    buckets.push("historical");
  } else if (candidate && isHistoricalApplicant(candidate)) {
    buckets.push("historical");
  } else {
    buckets.push("active");
  }
  if (PAPERWORK_PENDING.has(wf.workflowStatus) || wf.paperworkStatus === "not_sent") {
    if (PAPERWORK_PENDING.has(wf.workflowStatus)) buckets.push("paperwork_pending");
  }
  if (PAPERWORK_SENT.has(wf.workflowStatus) || wf.paperworkStatus === "sent" || wf.paperworkStatus === "viewed") {
    buckets.push("paperwork_sent");
  }
  if (SIGNED.has(wf.workflowStatus) || wf.paperworkStatus === "signed") {
    buckets.push("signed");
  }
  return [...new Set(buckets)];
}

function emptyBucketCounts(): Record<P2032StatusBucket, number> {
  return {
    active: 0,
    historical: 0,
    paperwork_pending: 0,
    paperwork_sent: 0,
    signed: 0,
    archived: 0,
    workflow: 0,
    ingestion: 0,
  };
}

export function buildDemoOwnershipAudit(input: {
  workflows: Record<string, CandidateWorkflowRecord>;
  ingestionCandidates?: BreezyCandidate[];
  rosterRecruiters?: string[];
}): P2032AuditCounts {
  const byDemoRecruiter = Object.fromEntries(DEMO_RECRUITER_NAMES.map((n) => [n, 0])) as Record<
    string,
    number
  >;
  const byStatusBucket = emptyBucketCounts();
  const byWorkflowStatus: Record<string, number> = {};
  const ingestionById = new Map((input.ingestionCandidates ?? []).map((c) => [c.candidateId, c]));

  let demoOwnedWorkflows = 0;
  for (const wf of Object.values(input.workflows)) {
    if (!isDemoRecruiterName(wf.assignedRecruiter)) continue;
    demoOwnedWorkflows += 1;
    const name = wf.assignedRecruiter.trim();
    byDemoRecruiter[name] = (byDemoRecruiter[name] ?? 0) + 1;
    byWorkflowStatus[wf.workflowStatus] = (byWorkflowStatus[wf.workflowStatus] ?? 0) + 1;
    for (const bucket of statusBuckets(wf, ingestionById.get(wf.candidateId))) {
      byStatusBucket[bucket] += 1;
    }
  }

  const selector = buildProductionRecruiterSelectorOptions({
    directory: readProductionRecruiterDirectoryFromEnv(),
    roster: input.rosterRecruiters ?? [],
  });
  const selectorDemoNames = selector.filter((n) => isDemoRecruiterName(n)).length;

  return {
    scannedWorkflows: Object.keys(input.workflows).length,
    scannedIngestion: input.ingestionCandidates?.length ?? 0,
    demoOwnedWorkflows,
    byDemoRecruiter,
    byStatusBucket,
    byWorkflowStatus,
    selectorDemoNames,
    actingRecruiterDemoHits: 0,
  };
}

export type P2032ProposeInput = {
  workflows: Record<string, CandidateWorkflowRecord>;
  ingestionCandidates?: BreezyCandidate[];
  rosterRecruiters: string[];
  manualEvidence: Record<string, ValidOwnershipEvidence>;
  productionAutoEvidence: Record<string, ValidOwnershipEvidence>;
  ledgerByCandidate: Record<string, P1884LedgerEvent[]>;
  p158Events: P158AssignmentAuditEvent[];
};

function territoryProposal(
  candidate: BreezyCandidate | undefined,
  rosterRecruiters: string[],
): { recruiter: string | null; detail: string } {
  const state = candidate?.state?.trim() ?? "";
  if (!state) return { recruiter: null, detail: "No territory state available" };
  const eligible = getTerritoryEligibleRecruiters({
    territoryState: state,
    rosterRecruiters,
  }).filter((n) => !isDemoRecruiterName(n) && n !== "Unassigned" && n !== "Recruiting Team");
  if (eligible.length === 1) {
    return {
      recruiter: eligible[0]!,
      detail: `Territory routing for ${state} → ${eligible[0]}`,
    };
  }
  if (eligible.length > 1) {
    return {
      recruiter: null,
      detail: `Territory routing ambiguous for ${state}: ${eligible.join(", ")}`,
    };
  }
  return { recruiter: null, detail: `Territory routing empty for ${state}` };
}

export function proposeDemoOwnershipCleanup(input: P2032ProposeInput): {
  preview: P2032PreviewRow[];
  operatorLocal: P2032OperatorLocalRow[];
} {
  const ingestionById = new Map((input.ingestionCandidates ?? []).map((c) => [c.candidateId, c]));
  const p158ByCandidate = new Map<string, P158AssignmentAuditEvent[]>();
  for (const event of input.p158Events) {
    const list = p158ByCandidate.get(event.candidateId) ?? [];
    list.push(event);
    p158ByCandidate.set(event.candidateId, list);
  }

  const preview: P2032PreviewRow[] = [];
  const operatorLocal: P2032OperatorLocalRow[] = [];

  for (const wf of Object.values(input.workflows)) {
    if (!isDemoRecruiterName(wf.assignedRecruiter)) continue;
    const candidate = ingestionById.get(wf.candidateId);
    const buckets = statusBuckets(wf, candidate);
    const isHistorical = buckets.includes("historical") || buckets.includes("archived");

    const candidates: ValidOwnershipEvidence[] = [];
    const manual = input.manualEvidence[wf.candidateId];
    const auto = input.productionAutoEvidence[wf.candidateId];
    const ledger = pickLatestValidLedgerEvidence(input.ledgerByCandidate[wf.candidateId] ?? []);
    const p158 = pickLatestValidP158Evidence(p158ByCandidate.get(wf.candidateId) ?? []);
    if (manual) candidates.push(manual);
    if (auto) candidates.push(auto);
    if (ledger) candidates.push(ledger);
    if (p158) candidates.push(p158);

    const uniqueNames = [...new Set(candidates.map((c) => c.recruiter))];
    let proposedReplacement: string | null = null;
    let replacementEvidence = "No valid non-demo ownership evidence";
    let replacementSource: P2032ReplacementSource = "none";
    let confidence: P2032Confidence = "none";
    let classification: P2032Classification = "unresolved";

    if (uniqueNames.length > 1) {
      classification = "conflicting_evidence";
      confidence = "low";
      replacementEvidence = `Conflicting valid owners: ${uniqueNames.join(", ")}`;
      proposedReplacement = null;
    } else if (uniqueNames.length === 1) {
      const chosen =
        manual ??
        ledger ??
        auto ??
        p158 ??
        candidates[0]!;
      proposedReplacement = chosen.recruiter;
      replacementEvidence = chosen.detail;
      replacementSource = chosen.source;
      confidence = chosen.source === "manual_audit" || chosen.source === "ownership_ledger" ? "high" : "high";
      classification = isHistorical && !P203_2_PRODUCTION_POLICY.autoRepairHistorical
        ? "historical_only"
        : "safe_automatic_repair";
    } else {
      const territory = territoryProposal(candidate, input.rosterRecruiters);
      if (
        territory.recruiter &&
        P203_2_PRODUCTION_POLICY.allowAutomaticTaylorFromTerritoryOnly
      ) {
        proposedReplacement = territory.recruiter;
        replacementEvidence = territory.detail;
        replacementSource = "territory_routing";
        confidence = "medium";
        classification = "safe_automatic_repair";
      } else if (P203_2_PRODUCTION_POLICY.allowRecruitingTeamFallbackWhenDemoOnlyEvidence) {
        proposedReplacement = "Recruiting Team";
        replacementEvidence = territory.recruiter
          ? `${territory.detail}; territory-only not auto-applied. Policy fallback → Recruiting Team (demo-only evidence).`
          : "Demo-only ownership evidence; production policy fallback → Recruiting Team";
        replacementSource = "recruiting_team_policy";
        confidence = "medium";
        classification = isHistorical && !P203_2_PRODUCTION_POLICY.autoRepairHistorical
          ? "historical_only"
          : "safe_automatic_repair";
      } else if (P203_2_PRODUCTION_POLICY.allowUnassignedFallback) {
        proposedReplacement = "Unassigned";
        replacementEvidence = "Policy fallback → Unassigned";
        replacementSource = "unassigned_policy";
        confidence = "low";
        classification = "operator_confirmation_required";
      } else {
        classification = isHistorical ? "historical_only" : "unresolved";
        confidence = "none";
        proposedReplacement = null;
      }
    }

    if (classification === "historical_only") {
      // Keep proposal for operator package but do not auto-repair.
    } else if (classification === "conflicting_evidence" || classification === "unresolved") {
      // leave proposed as-is
    }

    const operatorReviewRequired =
      classification !== "safe_automatic_repair" || confidence === "low" || confidence === "none";

    const expectedOwnershipVersion = wf.recruiterOwnershipVersion ?? 0;
    const row: P2032PreviewRow = {
      candidateId: wf.candidateId,
      redactedCandidateId: redactedCandidateId(wf.candidateId),
      currentDemoOwner: wf.assignedRecruiter.trim(),
      proposedReplacement,
      replacementEvidence,
      replacementSource,
      confidence,
      workflowVersion: expectedOwnershipVersion,
      expectedOwnershipVersion,
      expectedRecruiter: wf.assignedRecruiter.trim(),
      candidateStatus: wf.workflowStatus,
      paperworkStatus: wf.paperworkStatus ?? null,
      statusBuckets: buckets,
      classification,
      operatorReviewRequired,
      idempotencyKey: ownershipIdempotencyKey({
        candidateId: wf.candidateId,
        expectedOwnershipVersion,
        proposedReplacement: proposedReplacement ?? "NONE",
      }),
    };
    preview.push(row);
    operatorLocal.push({
      ...row,
      candidateName: candidate
        ? `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim() || null
        : null,
      email: candidate?.email ?? null,
      phone: candidate?.phone ?? null,
      state: candidate?.state ?? null,
      city: candidate?.city ?? null,
    });
  }

  preview.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  operatorLocal.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  return { preview, operatorLocal };
}

/** Prefer evidence-based restores, then active paperwork-needed, etc. Cap at max batch. */
export function selectAutomaticRepairBatch(
  preview: P2032PreviewRow[],
  maxBatch = P203_2_MAX_BATCH,
): P2032PreviewRow[] {
  const eligible = preview.filter(
    (row) =>
      row.classification === "safe_automatic_repair" &&
      row.proposedReplacement &&
      !row.operatorReviewRequired,
  );

  const rank = (row: P2032PreviewRow): number => {
    let score = 0;
    if (row.replacementSource === "manual_audit") score += 1000;
    if (row.replacementSource === "ownership_ledger") score += 900;
    if (row.replacementSource === "production_auto_audit") score += 800;
    if (row.replacementSource === "recruiting_team_policy") score += 100;
    if (row.statusBuckets.includes("paperwork_pending")) score += 50;
    if (row.statusBuckets.includes("active")) score += 40;
    if (row.statusBuckets.includes("paperwork_sent")) score += 30;
    if (row.confidence === "high") score += 20;
    if (row.confidence === "medium") score += 10;
    return score;
  };

  return [...eligible].sort((a, b) => rank(b) - rank(a) || a.candidateId.localeCompare(b.candidateId)).slice(0, maxBatch);
}

export function redactPreviewForPublic(preview: P2032PreviewRow[]): Array<
  Omit<P2032PreviewRow, "candidateId"> & { candidateId: string }
> {
  return preview.map((row) => ({
    ...row,
    candidateId: row.redactedCandidateId,
  }));
}
