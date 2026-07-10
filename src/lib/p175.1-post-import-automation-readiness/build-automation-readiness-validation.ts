import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { pickActiveOnboardingRecord } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import type { P157CandidateDecision } from "@/lib/p157-recruiter-decision-engine/types";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { evaluateP169CycleGates } from "@/lib/p169-autonomous-recruiting-orchestrator/evaluate-cycle-gates";
import { mapP157ToP169Outcome } from "@/lib/p169-autonomous-recruiting-orchestrator/map-candidate-outcome";
import { resolveP169EnvConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import { resolveP171LifecycleState } from "@/lib/p171-autonomous-candidate-lifecycle-manager/map-lifecycle-state";
import { resolveP171EnvConfig } from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-config";
import { discoverCandidate } from "@/lib/p170-unified-candidate-discovery/discover-candidate";
import { projectDropboxUsage } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import { exportSyntheticCandidateId } from "@/lib/p175-breezy-export-import/normalize";
import type {
  P1751AutomationReadinessReport,
  P1751CandidateValidationRow,
} from "@/lib/p175.1-post-import-automation-readiness/types";
import { P1751_SOURCE_PHASE } from "@/lib/p175.1-post-import-automation-readiness/types";

const EXPECTED_INGESTION_COUNT = 371;

function isValidEmail(email: string): boolean {
  const t = email.trim();
  return t.length > 3 && t.includes("@") && !/\s/.test(t);
}

function displayName(candidate: BreezyCandidate): string {
  const name = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim();
  return name || candidate.email || candidate.candidateId;
}

function pickNewest25(candidates: BreezyCandidate[]): BreezyCandidate[] {
  return [...candidates]
    .sort((a, b) => (b.appliedDate || b.addedDate).localeCompare(a.appliedDate || a.addedDate))
    .slice(0, 25);
}

function analyzeSyntheticIds(candidates: BreezyCandidate[]): {
  mismatchCount: number;
  collisionCount: number;
} {
  const bySynthetic = new Map<string, string[]>();
  let mismatchCount = 0;

  for (const candidate of candidates) {
    if (candidate.ingestionSource !== "breezy_export") continue;
    const expected = exportSyntheticCandidateId({
      email: candidate.email,
      positionName: candidate.positionName,
      appliedAt: candidate.appliedDate || candidate.addedDate,
    });
    if (candidate.candidateId !== expected) mismatchCount += 1;
    const list = bySynthetic.get(expected) ?? [];
    list.push(candidate.candidateId);
    bySynthetic.set(expected, list);
  }

  let collisionCount = 0;
  for (const ids of bySynthetic.values()) {
    if (ids.length > 1) collisionCount += ids.length - 1;
  }

  return { mismatchCount, collisionCount };
}

async function validateCandidateRow(input: {
  rank: number;
  candidate: BreezyCandidate;
  decision: P157CandidateDecision | null;
  auditEvents: Awaited<ReturnType<typeof loadDecisionCohort>>["auditEvents"];
  onboardingRecords: Awaited<ReturnType<typeof listAllCandidateOnboardingRecords>>;
  workflow: Awaited<ReturnType<typeof getCandidateWorkflowState>>[string] | undefined;
  p169MinConfidence: number;
  p171MinConfidence: number;
}): Promise<P1751CandidateValidationRow> {
  const { candidate, decision, workflow } = input;
  const email = candidate.email?.trim() ?? "";
  const invalidEmail = !isValidEmail(email);

  const p170 = await discoverCandidate(email || displayName(candidate), {
    skipDiscoveryStatus: true,
  });

  const p169Outcome = decision
    ? mapP157ToP169Outcome(decision, input.p169MinConfidence, null).outcome
    : null;

  const p171 = decision
    ? resolveP171LifecycleState({
        decision,
        workflow: workflow ?? null,
        minimumConfidence: input.p171MinConfidence,
        estimatedNextRun: null,
      }).state
    : null;

  let paperworkEligible = false;
  let blockers: string[] = [];
  let duplicatePaperworkRisk = false;
  let activeSignatureConflict = false;

  if (workflow && candidate) {
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: undefined,
    });
    const onboarding = pickActiveOnboardingRecord(input.onboardingRecords, candidate.candidateId);
    const hard = detectImmediatePaperworkHardBlockers({
      row,
      candidate,
      onboarding,
      auditEvents: input.auditEvents,
    });
    paperworkEligible = !hard.blocked;
    blockers = hard.blockers;
    duplicatePaperworkRisk =
      hard.primaryHardBlocker === "duplicate_candidate" ||
      blockers.some((b) => /duplicate/i.test(b));
    activeSignatureConflict = hard.primaryHardBlocker === "active_signature_request";
  } else if (!workflow) {
    blockers = ["No workflow record — P152 cannot evaluate send safety."];
  }

  if (invalidEmail) {
    blockers = [...blockers, "Invalid or missing email."];
    paperworkEligible = false;
  }

  if (!decision) {
    blockers = [...blockers, "Not in P157 MTD decision cohort."];
  }

  return {
    rank: input.rank,
    candidateId: candidate.candidateId,
    name: displayName(candidate),
    email,
    appliedAt: candidate.appliedDate || candidate.addedDate,
    positionName: candidate.positionName,
    ingestionSource: candidate.ingestionSource ?? null,
    foundInP170: p170.found,
    p157Recommendation: decision?.action ?? null,
    p157Confidence: decision?.confidence ?? null,
    p157Evaluated: decision != null,
    p169Outcome,
    p171State: p171,
    paperworkEligible,
    blockers,
    duplicatePaperworkRisk,
    activeSignatureConflict,
    invalidEmail,
  };
}

export async function buildP1751AutomationReadinessReport(): Promise<P1751AutomationReadinessReport> {
  const generatedAt = new Date().toISOString();
  const [store, cohort, workflows, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    loadDecisionCohort(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
  ]);

  const allCandidates = listIngestedCandidates(store);
  const ingestionCountActual = allCandidates.length;
  const dashboard = buildDecisionDashboardFromCohort(cohort);
  const decisionsById = new Map(dashboard.decisions.map((d) => [d.candidateId, d]));

  const p169Config = resolveP169EnvConfig();
  const p171Config = resolveP171EnvConfig();
  const p169Gates = await evaluateP169CycleGates(p169Config);

  const newest25Candidates = pickNewest25(allCandidates);
  const newest25: P1751CandidateValidationRow[] = [];

  for (let i = 0; i < newest25Candidates.length; i += 1) {
    const candidate = newest25Candidates[i]!;
    newest25.push(
      await validateCandidateRow({
        rank: i + 1,
        candidate,
        decision: decisionsById.get(candidate.candidateId) ?? null,
        auditEvents: cohort.auditEvents,
        onboardingRecords,
        workflow: workflows[candidate.candidateId],
        p169MinConfidence: p169Config.minimumConfidence,
        p171MinConfidence: p171Config.minimumConfidence,
      }),
    );
  }

  const invalidEmails = allCandidates.filter((c) => !isValidEmail(c.email ?? ""));
  const synthetic = analyzeSyntheticIds(allCandidates);

  const globalDuplicateRisk = allCandidates.filter((c) => {
    const wf = workflows[c.candidateId];
    if (!wf) return false;
    const row = buildScoredWorkflowRow(c, wf, { job: undefined });
    const onboarding = pickActiveOnboardingRecord(onboardingRecords, c.candidateId);
    const hard = detectImmediatePaperworkHardBlockers({
      row,
      candidate: c,
      onboarding,
      auditEvents: cohort.auditEvents,
    });
    return hard.primaryHardBlocker === "duplicate_candidate";
  });

  const globalSignatureConflicts = allCandidates.filter((c) => {
    const wf = workflows[c.candidateId];
    if (!wf) return false;
    const row = buildScoredWorkflowRow(c, wf, { job: undefined });
    const onboarding = pickActiveOnboardingRecord(onboardingRecords, c.candidateId);
    const hard = detectImmediatePaperworkHardBlockers({
      row,
      candidate: c,
      onboarding,
      auditEvents: cohort.auditEvents,
    });
    return hard.primaryHardBlocker === "active_signature_request";
  });

  const paperworkEligibleCount = newest25.filter((r) => r.paperworkEligible).length;
  const expectedPaperworkSendCount = newest25.filter(
    (r) => r.paperworkEligible && r.p169Outcome === "AUTO_SEND_PAPERWORK",
  ).length;
  const dropboxApiProjection = projectDropboxUsage(expectedPaperworkSendCount);

  const p170DiscoverableCount = newest25.filter((r) => r.foundInP170).length;
  const p157EvaluatedCount = newest25.filter((r) => r.p157Evaluated).length;

  const controlledReasons: string[] = [];
  if (!p169Gates.pass) controlledReasons.push(...p169Gates.blockingFactors);
  if (invalidEmails.length > 0) {
    controlledReasons.push(`${invalidEmails.length} candidates with invalid emails in ingestion store`);
  }
  if (globalDuplicateRisk.length > 0) {
    controlledReasons.push(`${globalDuplicateRisk.length} duplicate paperwork risk candidates globally`);
  }
  if (globalSignatureConflicts.length > 0) {
    controlledReasons.push(`${globalSignatureConflicts.length} active signature conflicts globally`);
  }
  if (synthetic.collisionCount > 0) {
    controlledReasons.push(`${synthetic.collisionCount} synthetic ID collisions detected`);
  }
  if (paperworkEligibleCount === 0 && expectedPaperworkSendCount === 0) {
    controlledReasons.push("No newest-25 candidates are P152 paperwork eligible (likely unassigned recruiter blockers)");
  }

  const checks = {
    ingestionCount371: ingestionCountActual === EXPECTED_INGESTION_COUNT,
    ingestionCountActual,
    p170Newest25Discoverable: p170DiscoverableCount === 25,
    p170DiscoverableCount,
    p157Newest25Evaluated: p157EvaluatedCount === 25,
    p157EvaluatedCount,
    p169Newest25Mapped: newest25.every((r) => r.p169Outcome != null),
    p171Newest25Mapped: newest25.every((r) => r.p171State != null),
    noDuplicatePaperworkRisk: !newest25.some((r) => r.duplicatePaperworkRisk),
    noActiveSignatureConflicts: !newest25.some((r) => r.activeSignatureConflict),
    noInvalidEmails: invalidEmails.length === 0,
    noSyntheticIdDuplicates: synthetic.collisionCount === 0 && synthetic.mismatchCount === 0,
  };

  const pipelineReady =
    checks.p170Newest25Discoverable &&
    checks.p157Newest25Evaluated &&
    checks.p169Newest25Mapped &&
    checks.p171Newest25Mapped;

  const dataReady = checks.ingestionCount371 && checks.noInvalidEmails && checks.noSyntheticIdDuplicates;

  const sendSafe =
    dataReady &&
    pipelineReady &&
    checks.noDuplicatePaperworkRisk &&
    checks.noActiveSignatureConflicts &&
    p169Gates.pass &&
    expectedPaperworkSendCount > 0;

  let conclusion: string;
  if (sendSafe) {
    conclusion =
      "P175 export import feeds the downstream pipeline. Newest 25 candidates are discoverable, evaluable, and mappable; controlled operator send is gated only by production gates.";
  } else if (dataReady && pipelineReady) {
    conclusion =
      "P175 import successfully feeds P170/P157/P169/P171 for the newest 25. Controlled operator send is not safe yet due to P152 blockers and/or production gates — not due to import gaps.";
  } else if (dataReady) {
    conclusion =
      "Ingestion parity achieved (371). Some downstream pipeline steps did not fully cover the newest 25 — review per-candidate rows.";
  } else {
    conclusion =
      "Post-import data integrity checks failed — ingestion count or synthetic ID validation did not pass.";
  }

  return {
    sourcePhase: P1751_SOURCE_PHASE,
    generatedAt,
    readOnly: true,
    checks,
    globalValidation: {
      invalidEmailCount: invalidEmails.length,
      invalidEmailSample: invalidEmails.slice(0, 10).map((c) => c.email),
      duplicatePaperworkRiskCount: globalDuplicateRisk.length,
      activeSignatureConflictCount: globalSignatureConflicts.length,
      syntheticIdMismatchCount: synthetic.mismatchCount,
      syntheticIdCollisionCount: synthetic.collisionCount,
      exportSourceCount: allCandidates.filter((c) => c.ingestionSource === "breezy_export").length,
      mergedSourceCount: allCandidates.filter((c) => c.ingestionSource === "merged").length,
      apiSourceCount: allCandidates.filter(
        (c) => c.ingestionSource === "breezy_api" || (!c.ingestionSource && c.addedDateSource !== "breezy_export"),
      ).length,
    },
    newest25,
    paperworkSummary: {
      paperworkEligibleCount,
      expectedPaperworkSendCount,
      dropboxApiProjection,
    },
    controlledOperatorSendCycle: {
      safe: sendSafe,
      reasons: controlledReasons,
      p169GatesPass: p169Gates.pass,
      p169BlockingFactors: p169Gates.blockingFactors,
    },
    conclusion,
  };
}
