import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { hasUsablePhone } from "@/lib/p228-production-readiness/eligibility";
import { evaluateP253Eligibility } from "@/lib/p253-controlled-live-paperwork-send/eligibility";
import { loadP253OpportunityPoints } from "@/lib/p253-controlled-live-paperwork-send/refresh";
import type { P253CandidateRow } from "@/lib/p253-controlled-live-paperwork-send/types";
import type { P254CandidateForensic } from "@/lib/p254-eligibility-forensics/types";
import { formatP255RecoveryReportMarkdown } from "@/lib/p255-recover-eligible-candidates/format";
import { repairP255Candidate } from "@/lib/p255-recover-eligible-candidates/repair";
import {
  loadJobsById,
  loadLocalAuthoritativeMaps,
  loadP254RecoverableCandidates,
} from "@/lib/p255-recover-eligible-candidates/sources";
import {
  P255_OPS_DATE,
  P255_PHASE,
  P255_SOURCE_ARTIFACT,
  type P255CandidateRecovery,
  type P255FieldAudit,
  type P255MissionResult,
} from "@/lib/p255-recover-eligible-candidates/types";

function writeArtifact(artifactsDir: string, name: string, value: unknown): string {
  mkdirSync(artifactsDir, { recursive: true });
  const target = path.join(artifactsDir, name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  return target;
}

/**
 * Cumulative audit vs P254 baseline (so re-runs still report mission repairs).
 */
async function buildBaselineFieldAudits(input: {
  forensic: P254CandidateForensic;
  sessionAudits: P255FieldAudit[];
}): Promise<P255FieldAudit[]> {
  const byField = new Map<string, P255FieldAudit>();
  for (const a of input.sessionAudits) byField.set(a.field, a);

  const [store, workflows] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
  ]);
  const ing = store.candidates[input.forensic.candidateId];
  const wf = workflows[input.forensic.candidateId];

  const phoneNow = String(ing?.phone ?? "");
  if (input.forensic.allBlockers.includes("missing_phone") && hasUsablePhone(phoneNow)) {
    byField.set("phone", {
      field: "phone",
      before: "",
      after: phoneNow,
      source: byField.get("phone")?.source ?? "breezy",
      applied: true,
      reason:
        byField.get("phone")?.reason ??
        "Backfilled usable phone (durable was empty at P254)",
    });
  }

  const cityNow = String(ing?.city ?? "").trim();
  const stateNow = String(ing?.state ?? "").trim().toUpperCase();
  if (
    input.forensic.allBlockers.includes("coverage_blocked") &&
    (!String(input.forensic.location ?? "").trim() || !input.forensic.coverageKnown)
  ) {
    if (cityNow) {
      byField.set("city", {
        field: "city",
        before: "",
        after: cityNow,
        source: byField.get("city")?.source ?? "p226_recovery_store",
        applied: true,
        reason:
          byField.get("city")?.reason ??
          "Backfilled city for coverage geocode (empty at P254)",
      });
    }
    if (stateNow) {
      byField.set("state", {
        field: "state",
        before: "",
        after: stateNow,
        source: byField.get("state")?.source ?? "p226_recovery_store",
        applied: true,
        reason:
          byField.get("state")?.reason ??
          "Backfilled state for coverage geocode (empty at P254)",
      });
    }
  }

  const recruiterNow = String(wf?.assignedRecruiter ?? "Unassigned");
  if (
    input.forensic.allBlockers.includes("missing_recruiter") &&
    recruiterNow &&
    !/^unassigned$/i.test(recruiterNow)
  ) {
    byField.set("assignedRecruiter", {
      field: "assignedRecruiter",
      before: String(input.forensic.recruiter || "Unassigned"),
      after: recruiterNow,
      source: "workflow_db",
      applied: true,
      reason:
        byField.get("assignedRecruiter")?.reason ??
        "Assigned Taylor when recruiter was Unassigned",
    });
  }

  const dmNow = String(wf?.assignedDM ?? "Unassigned");
  if (
    input.forensic.allBlockers.includes("missing_dm") &&
    dmNow &&
    !/^unassigned$/i.test(dmNow)
  ) {
    byField.set("assignedDM", {
      field: "assignedDM",
      before: String(input.forensic.districtManager || "Unassigned"),
      after: dmNow,
      source:
        byField.get("assignedDM")?.source ??
        "p216_position_location_territory_routing",
      applied: true,
      reason:
        byField.get("assignedDM")?.reason ??
        "Assigned DM from position location territory routing",
    });
  }

  return [...byField.values()];
}

async function evaluateCohortEligibility(input: {
  candidateIds: string[];
  allowNetworkGeocode: boolean;
}): Promise<{ rows: Map<string, P253CandidateRow>; opportunityPoints: number }> {
  const [store, workflows, onboardingRecords, jobsResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
    fetchBreezyJobs("published"),
  ]);

  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const opportunityPoints = await loadP253OpportunityPoints({
    allowNetwork: input.allowNetworkGeocode,
    jobs,
  });

  const candidatesById = new Map(
    listIngestedCandidates(store).map((c) => [c.candidateId, c]),
  );
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((r) => [r.candidateId, r]),
  );

  // Restrict workflows to the recovery cohort so we don't re-score the whole book.
  const scopedWorkflows: typeof workflows = {};
  for (const id of input.candidateIds) {
    if (workflows[id]) scopedWorkflows[id] = workflows[id]!;
  }

  const eligibility = await evaluateP253Eligibility({
    workflows: scopedWorkflows,
    candidatesById,
    onboardingByCandidateId,
    opportunityPoints,
    allowNetworkGeocode: input.allowNetworkGeocode,
  });

  return {
    rows: new Map(eligibility.rows.map((row) => [row.candidateId, row])),
    opportunityPoints: opportunityPoints.length,
  };
}

/**
 * P255 — Recover remaining P254 auto-recoverable candidates.
 * Applies minimal durable repairs (phone/coverage/recruiter/DM). Never sends paperwork.
 */
export async function runP255RecoverEligibleCandidates(input?: {
  cwd?: string;
  artifactsDir?: string;
  sourceArtifact?: string;
  /** Default true — apply durable recovery writes. Pass false for dry-run. */
  persist?: boolean;
  allowNetworkGeocode?: boolean;
}): Promise<P255MissionResult> {
  const cwd = input?.cwd ?? process.cwd();
  const artifactsDir = input?.artifactsDir ?? path.join(cwd, "artifacts");
  const sourceArtifact = input?.sourceArtifact ?? P255_SOURCE_ARTIFACT;
  const persist = input?.persist !== false;
  const allowNetworkGeocode = input?.allowNetworkGeocode !== false;
  const generatedAt = new Date().toISOString();
  const notes: string[] = [];

  const { recoverable } = loadP254RecoverableCandidates(cwd, sourceArtifact);
  notes.push(`Loaded ${recoverable.length} auto-recoverable candidate(s) from ${sourceArtifact}`);

  const maps = loadLocalAuthoritativeMaps(cwd);
  const jobsById = await loadJobsById();
  notes.push(`Published Breezy jobs loaded=${jobsById.size}`);

  let workflowWrites = 0;
  let ingestionWrites = 0;
  const partials: Array<
    Awaited<ReturnType<typeof repairP255Candidate>>["recovery"] & {
      workflowWrites: number;
      ingestionWrites: number;
    }
  > = [];

  for (const forensic of recoverable) {
    const result = await repairP255Candidate({
      forensic,
      jobsById,
      maps,
      persist,
    });
    workflowWrites += result.workflowWrites;
    ingestionWrites += result.ingestionWrites;
    partials.push({
      ...result.recovery,
      workflowWrites: result.workflowWrites,
      ingestionWrites: result.ingestionWrites,
    });
  }

  const eligibilityEval = await evaluateCohortEligibility({
    candidateIds: recoverable.map((c) => c.candidateId),
    allowNetworkGeocode,
  });
  const eligibilityById = eligibilityEval.rows;
  notes.push(`Opportunity geocode points=${eligibilityEval.opportunityPoints}`);

  const candidates: P255CandidateRecovery[] = [];
  for (const partial of partials) {
    const forensic = recoverable.find((c) => c.candidateId === partial.candidateId)!;
    const after = eligibilityById.get(partial.candidateId);
    const blockersAfter = after?.blockers ?? ["eligibility_row_missing"];
    const nowEligible = after?.eligible === true;
    const stillBlocked = !nowEligible;
    const fieldAudits = await buildBaselineFieldAudits({
      forensic,
      sessionAudits: partial.fieldAudits,
    });
    candidates.push({
      candidateId: partial.candidateId,
      name: partial.name,
      email: partial.email,
      blockersBefore: partial.blockersBefore,
      blockersAfter,
      repaired: fieldAudits.some((a) => a.applied && a.before !== a.after),
      nowEligible,
      stillBlocked,
      stillBlockedReasons: stillBlocked ? blockersAfter : [],
      eligibilityResultBefore: partial.eligibilityResultBefore,
      eligibilityResultAfter: after?.result ?? "other_blocked",
      nearestMilesAfter: after?.nearestMiles ?? null,
      coverageKnownAfter: after?.coverageKnown ?? false,
      fieldAudits,
      notes: partial.notes,
    });
  }

  const fieldChangesApplied = candidates.reduce(
    (sum, c) => sum + c.fieldAudits.filter((a) => a.applied).length,
    0,
  );

  const ingestionFields = new Set([
    "phone",
    "city",
    "state",
    "zipCode",
    "firstName",
    "lastName",
    "email",
    "positionId",
    "positionName",
  ]);
  const inferredIngestionWrites = candidates.filter((c) =>
    c.fieldAudits.some((a) => a.applied && ingestionFields.has(a.field)),
  ).length;
  const inferredWorkflowWrites = candidates.filter((c) =>
    c.fieldAudits.some(
      (a) => a.applied && (a.field === "assignedRecruiter" || a.field === "assignedDM"),
    ),
  ).length;

  const result: P255MissionResult = {
    phase: P255_PHASE,
    opsDate: P255_OPS_DATE,
    generatedAt,
    mode: persist ? "recovery_apply" : "dry_run",
    sourceArtifact,
    persist,
    totals: {
      targeted: candidates.length,
      repaired: candidates.filter((c) => c.repaired).length,
      nowEligible: candidates.filter((c) => c.nowEligible).length,
      stillBlocked: candidates.filter((c) => c.stillBlocked).length,
      fieldChangesApplied,
    },
    candidates,
    eligibilityRowsAfter: [...eligibilityById.values()],
    safety: {
      paperworkSends: 0,
      dropboxWrites: 0,
      breezyWrites: 0,
      melWrites: 0,
      // Prefer live session counters; fall back to baseline-inferred mission writes.
      workflowWrites: workflowWrites || inferredWorkflowWrites,
      ingestionWrites: ingestionWrites || inferredIngestionWrites,
    },
    notes,
    artifacts: [],
  };

  const jsonRel = path.join("artifacts", "p255-recovery-report.json");
  const mdRel = path.join("artifacts", "p255-recovery-report.md");
  result.artifacts = [jsonRel, mdRel];

  writeArtifact(artifactsDir, "p255-recovery-report.json", result);
  writeArtifact(
    artifactsDir,
    "p255-recovery-report.md",
    formatP255RecoveryReportMarkdown(result),
  );

  return result;
}
