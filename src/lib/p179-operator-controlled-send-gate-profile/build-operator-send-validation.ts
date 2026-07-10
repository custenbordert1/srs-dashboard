import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { projectDropboxUsage } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { pickActiveOnboardingRecord } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { mapP157ToP169Outcome } from "@/lib/p169-autonomous-recruiting-orchestrator/map-candidate-outcome";
import { resolveP169EnvConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import { evaluateSendCycleGates } from "@/lib/p179-operator-controlled-send-gate-profile/evaluate-send-cycle-gates";
import {
  P179_SOURCE_PHASE,
  type P179CandidateSendRow,
  type P179OperatorSendValidationReport,
} from "@/lib/p179-operator-controlled-send-gate-profile/types";

function displayName(c: BreezyCandidate): string {
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || c.candidateId;
}

function pickNewest25(candidates: BreezyCandidate[]): BreezyCandidate[] {
  return [...candidates]
    .sort((a, b) => (b.appliedDate || b.addedDate).localeCompare(a.appliedDate || a.addedDate))
    .slice(0, 25);
}

function isPaperworkReadyCandidate(row: {
  p152Eligible: boolean;
  p157Action: string | null;
  p169Outcome: string | null;
}): boolean {
  return (
    row.p152Eligible &&
    row.p157Action === "Send Paperwork" &&
    row.p169Outcome === "AUTO_SEND_PAPERWORK"
  );
}

export async function buildP179OperatorSendValidationReport(): Promise<P179OperatorSendValidationReport> {
  const generatedAt = new Date().toISOString();
  const p169Config = resolveP169EnvConfig();

  const [store, cohort, workflows, onboardingRecords, operatorGates, autonomousGates] =
    await Promise.all([
      readIngestionStore(),
      loadDecisionCohort(),
      getCandidateWorkflowState(),
      listAllCandidateOnboardingRecords(),
      evaluateSendCycleGates({ profile: "operator", readinessThreshold: p169Config.readinessThreshold }),
      evaluateSendCycleGates({ profile: "autonomous", readinessThreshold: p169Config.readinessThreshold }),
    ]);

  const dashboard = buildDecisionDashboardFromCohort(cohort);
  const decisionsById = new Map(dashboard.decisions.map((d) => [d.candidateId, d]));
  const newest25 = pickNewest25(listIngestedCandidates(store));

  const candidates: P179CandidateSendRow[] = newest25.map((candidate) => {
    const workflow = workflows[candidate.candidateId];
    const onboarding = pickActiveOnboardingRecord(onboardingRecords, candidate.candidateId);
    const row = buildScoredWorkflowRow(candidate, workflow, { job: undefined });
    const p152 = detectImmediatePaperworkHardBlockers({
      row,
      candidate,
      onboarding,
      auditEvents: cohort.auditEvents,
    });
    const p157 = decisionsById.get(candidate.candidateId) ?? null;
    const p169 = p157
      ? mapP157ToP169Outcome(p157, p169Config.minimumConfidence, null)
      : null;

    const candidateBlockers = [...p152.blockers];
    if (p157?.action !== "Send Paperwork") {
      candidateBlockers.push(`P157 action is ${p157?.action ?? "unknown"} (not Send Paperwork)`);
    }

    const paperworkReady = isPaperworkReadyCandidate({
      p152Eligible: !p152.blocked,
      p157Action: p157?.action ?? null,
      p169Outcome: p169?.outcome ?? null,
    });

    const operatorBlockers = [
      ...candidateBlockers,
      ...operatorGates.blockingFactors,
    ];
    const autonomousBlockers = [
      ...candidateBlockers,
      ...autonomousGates.blockingFactors,
    ];

    return {
      candidateId: candidate.candidateId,
      name: displayName(candidate),
      email: candidate.email?.trim() ?? "",
      assignedRecruiter: workflow?.assignedRecruiter?.trim() || "Unassigned",
      workflowStatus: workflow?.workflowStatus ?? null,
      p152Eligible: !p152.blocked,
      p152Blockers: p152.blockers,
      p157Action: p157?.action ?? null,
      p169Outcome: p169?.outcome ?? null,
      operatorSendAllowed: paperworkReady && operatorGates.pass,
      autonomousSendAllowed: paperworkReady && autonomousGates.pass,
      operatorBlockers: paperworkReady && operatorGates.pass ? [] : operatorBlockers,
      autonomousBlockers: paperworkReady && autonomousGates.pass ? [] : autonomousBlockers,
    };
  });

  const paperworkReady = candidates.filter((c) =>
    isPaperworkReadyCandidate({
      p152Eligible: c.p152Eligible,
      p157Action: c.p157Action,
      p169Outcome: c.p169Outcome,
    }),
  );

  const projectedSendCount = paperworkReady.filter((c) => c.operatorSendAllowed).length;
  const dropboxProjection = projectDropboxUsage(projectedSendCount);

  const operatorBatchAllowed =
    operatorGates.pass && projectedSendCount > 0 && dropboxProjection.withinBudget;

  const warnings = [
    ...operatorGates.warnings,
    ...(dropboxProjection.withinBudget
      ? []
      : [
          `Projected Dropbox API usage (${dropboxProjection.totalRequests}) exceeds cycle budget (${dropboxProjection.budgetCeiling}) for ${projectedSendCount} sends`,
        ]),
    ...(autonomousGates.pass ? [] : [`Autonomous gates blocked: ${autonomousGates.blockingFactors.join("; ")}`]),
  ];

  return {
    sourcePhase: P179_SOURCE_PHASE,
    generatedAt,
    readOnly: true,
    gateProfiles: {
      operator: operatorGates,
      autonomous: autonomousGates,
    },
    summary: {
      paperworkReadyCount: paperworkReady.length,
      operatorGateProfilePass: operatorGates.pass,
      operatorSendAllowed: operatorBatchAllowed,
      autonomousSendAllowed: autonomousGates.pass && projectedSendCount > 0 && dropboxProjection.withinBudget,
      maxSendsWithinDropboxBudget: Math.floor(dropboxProjection.budgetCeiling / 2),
      projectedSendCount,
      projectedDropboxApiCalls: dropboxProjection.totalRequests,
      dropboxWithinBudget: dropboxProjection.withinBudget,
      blockedCandidateCount: candidates.filter((c) => !c.operatorSendAllowed).length,
      warningCount: warnings.length,
    },
    candidates,
    blockedCandidates: candidates.filter((c) => !c.operatorSendAllowed),
    warnings,
    safetyConfirmation: [
      "Read-only validation — no paperwork sends",
      "No Breezy or Dropbox writes",
      "No automation enabled, no daemon started",
      "Operator profile: readiness/scheduler/executive factors are warnings only",
      "Autonomous profile: all production gates remain strict",
    ],
  };
}
