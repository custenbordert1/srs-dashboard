import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { buildExecutionDecisions } from "@/lib/candidate-automation-execution/build-execution-decisions";
import { countEligibleForPaperwork } from "@/lib/candidate-onboarding-engine";
import type {
  AutomationBlockers,
  FunnelGate,
  FunnelReadinessAudit,
  GateFailureCounts,
  GateFailureReason,
  RecruiterReplacementReadiness,
  ReplacementReadinessScore,
} from "@/lib/recruiter-replacement-readiness/types";
import {
  countPaperworkEligible,
  traceCandidateFunnelGate,
} from "@/lib/recruiter-replacement-readiness/trace-funnel-gates";

const GRADES: AiLetterGrade[] = ["A+", "A", "B", "C", "D"];

function emptyFailureCounts(): GateFailureCounts {
  return {
    missing_workflow_record: 0,
    terminal_status: 0,
    manual_recruiter_hold: 0,
    recruiter_unassigned: 0,
    territory_undetermined: 0,
    no_recruiter_roster: 0,
    assignment_confidence_low: 0,
    missing_p63_action: 0,
    p63_action_none: 0,
    missing_p64_progression: 0,
    execution_not_mappable: 0,
    missing_contact_email: 0,
    missing_job_match: 0,
    wrong_paperwork_action_type: 0,
    active_paperwork_packet: 0,
    paperwork_already_signed: 0,
    ready_for_mel_terminal: 0,
    eligible: 0,
  };
}

function emptyGateCounts(): Record<FunnelGate, number> {
  return {
    mtd_ingested: 0,
    workflow_sync: 0,
    p62_assignment: 0,
    p63_action: 0,
    p64_progression: 0,
    p65_2_execution: 0,
    p65_3_paperwork: 0,
  };
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function confidenceBucket(confidence: number | null | undefined): "high" | "medium" | "low" | "none" {
  if (confidence == null || confidence <= 0) return "none";
  if (confidence >= 80) return "high";
  if (confidence >= 50) return "medium";
  return "low";
}

function buildAudit(rows: ScoredCandidateWorkflowRow[]): FunnelReadinessAudit {
  const gradeDistribution = Object.fromEntries(GRADES.map((grade) => [grade, 0])) as Record<
    AiLetterGrade,
    number
  >;
  const confidenceDistribution = { high: 0, medium: 0, low: 0, none: 0 };
  const workflowStatusDistribution: Record<string, number> = {};

  let recruiterAssigned = 0;
  let p63ActionGenerated = 0;

  for (const row of rows) {
    if (!isUnassignedRecruiter(row.assignedRecruiter)) recruiterAssigned += 1;
    if (row.actionGeneratedAt && row.requiredAction?.trim()) p63ActionGenerated += 1;

    gradeDistribution[row.aiGrade] = (gradeDistribution[row.aiGrade] ?? 0) + 1;
    const bucket = confidenceBucket(row.actionConfidence);
    confidenceDistribution[bucket] += 1;
    workflowStatusDistribution[row.workflowStatus] =
      (workflowStatusDistribution[row.workflowStatus] ?? 0) + 1;
  }

  return {
    totalCandidates: rows.length,
    recruiterAssigned,
    recruiterUnassigned: rows.length - recruiterAssigned,
    p63ActionGenerated,
    missingAction: rows.length - p63ActionGenerated,
    gradeDistribution,
    confidenceDistribution,
    workflowStatusDistribution,
  };
}

function buildBlockers(traces: ReturnType<typeof traceCandidateFunnelGate>[]): AutomationBlockers {
  let blockedBeforeAssignment = 0;
  let blockedBeforeP63 = 0;
  let blockedBeforeP64 = 0;
  let blockedBeforeP65_2 = 0;
  let blockedBeforeP65_3 = 0;

  for (const trace of traces) {
    if (!trace.firstStageFailed) continue;
    const failed = trace.firstStageFailed;
    if (failed === "workflow_sync" || failed === "p62_assignment") {
      blockedBeforeAssignment += 1;
    } else if (failed === "p63_action") {
      blockedBeforeP63 += 1;
    } else if (failed === "p64_progression") {
      blockedBeforeP64 += 1;
    } else if (failed === "p65_2_execution") {
      blockedBeforeP65_2 += 1;
    } else if (failed === "p65_3_paperwork") {
      blockedBeforeP65_3 += 1;
    }
  }

  return {
    blockedBeforeAssignment,
    blockedBeforeP63,
    blockedBeforeP64,
    blockedBeforeP65_2,
    blockedBeforeP65_3,
  };
}

function resolveRootCause(input: {
  gateFailureCounts: GateFailureCounts;
  firstStageFailedCounts: Record<FunnelGate, number>;
  audit: FunnelReadinessAudit;
}): RecruiterReplacementReadiness["rootCause"] {
  const { gateFailureCounts, firstStageFailedCounts, audit } = input;

  const primaryGate = (Object.entries(firstStageFailedCounts) as [FunnelGate, number][])
    .filter(([gate]) => gate !== "mtd_ingested")
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "p62_assignment";

  const primaryReason = (Object.entries(gateFailureCounts) as [GateFailureReason, number][])
    .filter(([reason]) => reason !== "eligible")
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "recruiter_unassigned";

  const fixByReason: Record<GateFailureReason, string> = {
    missing_workflow_record: "workflow sync / post-import pipeline (P64.2 ingestion → workflow overlay)",
    terminal_status: "data quality — terminal candidates excluded by design",
    manual_recruiter_hold: "P62 manual assignment hold — recruiter must assign or clear manual hold",
    recruiter_unassigned: "P62 recruiter-assignment-engine — run assignment or fix roster/territory",
    territory_undetermined: "P62 + candidate/job state normalization (candidate-dm-suggest, dm-territory-map)",
    no_recruiter_roster: "workflow rosters configuration (candidate-workflow-store rosters)",
    assignment_confidence_low: "P62 confidence threshold / ownership scoring (recruiter-assignment-engine)",
    missing_p63_action: "P63 recruiter-action-engine — run after P62 assigns recruiters",
    p63_action_none: "P63 buildRecruiterActionDecision — candidate blocked before actionable step",
    missing_p64_progression: "P64 candidate-progression-engine — run progression after P63",
    execution_not_mappable: "P65.2 execution mapping — action type not executable",
    missing_contact_email: "data ingestion — candidate email missing from Breezy sync",
    missing_job_match: "data ingestion — positionId not in published jobs map",
    wrong_paperwork_action_type: "P63 action type alignment — need send-paperwork or await-signature",
    active_paperwork_packet: "P65.3 status sync — packet already in flight",
    paperwork_already_signed: "P65.3 ready-for-mel prep — paperwork complete",
    ready_for_mel_terminal: "P66 handoff — candidate already ready for MEL",
    eligible: "none",
  };

  const summary =
    audit.recruiterUnassigned === audit.totalCandidates
      ? `All ${audit.totalCandidates} MTD candidates are recruiter-unassigned — P62 never persisted assignments, blocking P63 actions and P65.3 paperwork.`
      : audit.missingAction === audit.totalCandidates
        ? `All ${audit.totalCandidates} MTD candidates lack P63 actions — assignment or action engine has not run.`
        : `Primary funnel blockage at ${primaryGate} (${firstStageFailedCounts[primaryGate]} candidates) — ${primaryReason}.`;

  return {
    summary,
    primaryGate,
    primaryReason,
    recommendedFixLocation: fixByReason[primaryReason],
  };
}

export function buildRecruiterReplacementReadiness(input: {
  candidates: BreezyCandidate[];
  rows: ScoredCandidateWorkflowRow[];
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
  rosters?: RecruiterRosters;
  escalationDelayHours?: number;
}): RecruiterReplacementReadiness {
  const escalationDelayHours = input.escalationDelayHours ?? 48;
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));

  const gateFailureCounts = emptyFailureCounts();
  const firstStageFailedCounts = emptyGateCounts();
  const traces = input.rows.map((row) => {
    const trace = traceCandidateFunnelGate({
      row,
      candidate: candidateById.get(row.candidateId) ?? row,
      workflow: input.workflows[row.candidateId],
      job: input.jobsByPositionId.get(row.positionId),
      rosters: input.rosters,
      jobsByPositionId: input.jobsByPositionId,
      escalationDelayHours,
    });
    if (trace.firstStageFailed) {
      gateFailureCounts[trace.failureReason] += 1;
      firstStageFailedCounts[trace.firstStageFailed] += 1;
    } else {
      gateFailureCounts.eligible += 1;
    }
    return trace;
  });

  const audit = buildAudit(input.rows);
  const blockers = buildBlockers(traces);
  const paperworkEligible = countPaperworkEligible(input.rows);
  const executionReady = buildExecutionDecisions({
    candidates: input.rows,
    escalationDelayHours,
  }).length;
  const progressionReady = input.rows.filter(
    (row) => row.recommendedStage?.trim() || row.progressionGeneratedAt,
  ).length;

  const readinessScore: ReplacementReadinessScore = {
    assignmentReadinessPct: pct(audit.recruiterAssigned, audit.totalCandidates),
    actionReadinessPct: pct(audit.p63ActionGenerated, audit.totalCandidates),
    decisionReadinessPct: pct(progressionReady, audit.totalCandidates),
    executionReadinessPct: pct(executionReady, audit.totalCandidates),
    paperworkReadinessPct: pct(paperworkEligible, audit.totalCandidates),
  };

  const rootCause = resolveRootCause({ gateFailureCounts, firstStageFailedCounts, audit });

  return {
    audit,
    gateFailureCounts,
    firstStageFailedCounts,
    readinessScore,
    blockers,
    rootCause,
    mtdTotal: audit.totalCandidates,
    paperworkEligible: countEligibleForPaperwork(input.rows),
  };
}
