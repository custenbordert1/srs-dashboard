import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { AutonomousPaperworkDashboardSnapshot } from "@/lib/autonomous-paperwork-engine/types";
import type { AutonomousCandidateCommunicationDashboardSnapshot } from "@/lib/autonomous-candidate-communication-engine/types";
import type { OrchestratorDashboardSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
import type {
  OperationalIssue,
  OperationsEngineId,
  OperationsSeverity,
} from "@/lib/autonomous-operations-center/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(iso: string | null | undefined, referenceMs: number): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return (referenceMs - parsed) / MS_PER_DAY;
}

function makeIssue(input: Omit<OperationalIssue, "issueId" | "detectedAt"> & { detectedAt?: string; fetchedAt: string }): OperationalIssue {
  return {
    issueId: `p75-${input.issueType}-${input.affectedCandidateIds[0] ?? "system"}`,
    detectedAt: input.detectedAt ?? input.fetchedAt,
    ...input,
  };
}

export function detectOperationalIssues(input: {
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  orchestrations: CandidateOrchestrationSnapshot[];
  paperwork: AutonomousPaperworkDashboardSnapshot;
  communication: AutonomousCandidateCommunicationDashboardSnapshot;
  orchestrator: OrchestratorDashboardSnapshot;
  referenceMs: number;
  fetchedAt: string;
}): OperationalIssue[] {
  const issues: OperationalIssue[] = [];
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  for (const row of input.workflowRows) {
    const name = formatCandidateDisplayName(row);
    const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
    const ids = [row.candidateId];
    const names = [name];

    const stalledDays = daysSince(row.lastActionAt ?? row.appliedDate, input.referenceMs);
    if (stalledDays != null && stalledDays >= 7 && row.workflowStatus !== "Active Rep") {
      issues.push(
        makeIssue({
          issueType: "candidate_stalled",
          severity: stalledDays >= 14 ? "critical" : "high",
          reason: `No activity for ${Math.floor(stalledDays)} days.`,
          affectedCandidateIds: ids,
          affectedCandidateNames: names,
          recommendedAction: "Review candidate workflow and assign recruiter follow-up.",
          responsibleEngine: "orchestrator",
          owner: row.assignedRecruiter || "Recruiting",
          confidence: 0.9,
          fetchedAt: input.fetchedAt,
        }),
      );
    }

    if (!row.email?.trim()) {
      issues.push(
        makeIssue({
          issueType: "missing_email",
          severity: "high",
          reason: "Candidate email missing — blocks communication and paperwork.",
          affectedCandidateIds: ids,
          affectedCandidateNames: names,
          recommendedAction: "Collect candidate email before automation.",
          responsibleEngine: "recruiting",
          owner: row.assignedRecruiter || "Recruiting",
          confidence: 0.95,
          fetchedAt: input.fetchedAt,
        }),
      );
    }

    if (isUnassignedRecruiter(row.assignedRecruiter ?? "")) {
      issues.push(
        makeIssue({
          issueType: "missing_recruiter",
          severity: "medium",
          reason: "Recruiter not assigned.",
          affectedCandidateIds: ids,
          affectedCandidateNames: names,
          recommendedAction: "Assign recruiter to unblock workflow.",
          responsibleEngine: "recruiting",
          owner: "Recruiting Operations",
          confidence: 0.92,
          fetchedAt: input.fetchedAt,
        }),
      );
    }

    const duplicateReason = duplicatePaperworkSendBlockReason({
      workflow: {
        candidateId: row.candidateId,
        paperworkStatus: row.paperworkStatus,
        workflowStatus: row.workflowStatus,
        signatureRequestId: row.signatureRequestId,
      } as never,
      activeOnboarding: onboarding,
    });
    if (duplicateReason) {
      issues.push(
        makeIssue({
          issueType: "duplicate_paperwork",
          severity: "medium",
          reason: duplicateReason,
          affectedCandidateIds: ids,
          affectedCandidateNames: names,
          recommendedAction: "Resolve duplicate paperwork before resending.",
          responsibleEngine: "paperwork",
          owner: row.assignedRecruiter || "Paperwork",
          confidence: 0.88,
          fetchedAt: input.fetchedAt,
        }),
      );
    }

    if (row.paperworkError) {
      issues.push(
        makeIssue({
          issueType: "workflow_failure",
          severity: "critical",
          reason: `Paperwork error: ${row.paperworkError}`,
          affectedCandidateIds: ids,
          affectedCandidateNames: names,
          recommendedAction: "Investigate paperwork failure and retry in preview.",
          responsibleEngine: "paperwork",
          owner: row.assignedRecruiter || "Paperwork",
          confidence: 0.93,
          fetchedAt: input.fetchedAt,
        }),
      );
    }

    if (row.paperworkSignedAt && row.workflowStatus === "Paperwork Sent") {
      issues.push(
        makeIssue({
          issueType: "missing_onboarding",
          severity: "medium",
          reason: "Paperwork signed but onboarding workflow not advanced.",
          affectedCandidateIds: ids,
          affectedCandidateNames: names,
          recommendedAction: "Advance candidate to onboarding stage.",
          responsibleEngine: "onboarding",
          owner: row.assignedRecruiter || "Onboarding",
          confidence: 0.85,
          fetchedAt: input.fetchedAt,
        }),
      );
    }

    const sentDays = daysSince(row.paperworkSentAt, input.referenceMs);
    if (sentDays != null && sentDays >= 2 && !row.paperworkSignedAt) {
      issues.push(
        makeIssue({
          issueType: "communication_overdue",
          severity: sentDays >= 4 ? "high" : "medium",
          reason: `Paperwork unsigned for ${Math.floor(sentDays)} days.`,
          affectedCandidateIds: ids,
          affectedCandidateNames: names,
          recommendedAction: "Schedule communication reminders (preview only).",
          responsibleEngine: "communication",
          owner: row.assignedRecruiter || "Communication",
          confidence: 0.87,
          fetchedAt: input.fetchedAt,
        }),
      );
    }
  }

  for (const blocked of input.orchestrations.filter((o) => o.workflowStage === "blocked" || o.blockers.length > 0)) {
    if (issues.some((i) => i.affectedCandidateIds.includes(blocked.candidateId))) continue;
    issues.push(
      makeIssue({
        issueType: "paperwork_blocked",
        severity: blocked.riskLevel === "critical" ? "critical" : "high",
        reason: blocked.blockers.join("; ") || "Automation blocked by orchestrator.",
        affectedCandidateIds: [blocked.candidateId],
        affectedCandidateNames: [blocked.candidateName],
        recommendedAction: blocked.nextAction,
        responsibleEngine: mapOrchestratorEngine(blocked.responsibleEngine),
        owner: blocked.recruiter,
        confidence: 0.86,
        fetchedAt: input.fetchedAt,
      }),
    );
  }

  if (input.paperwork.failedPackets.length > 0) {
    issues.push(
      makeIssue({
        issueType: "workflow_failure",
        severity: "high",
        reason: `${input.paperwork.failedPackets.length} failed paperwork packets detected.`,
        affectedCandidateIds: input.paperwork.failedPackets.map((r) => r.candidateId),
        affectedCandidateNames: input.paperwork.failedPackets.map((r) => r.candidateName),
        recommendedAction: "Review failed packets in paperwork engine.",
        responsibleEngine: "paperwork",
        owner: "Paperwork Operations",
        confidence: 0.91,
        fetchedAt: input.fetchedAt,
      }),
    );
  }

  const queueDepth = input.communication.health.queued + input.paperwork.candidateQueue.length;
  if (queueDepth > 50) {
    issues.push(
      makeIssue({
        issueType: "queue_growing",
        severity: queueDepth > 100 ? "critical" : "high",
        reason: `Combined queue depth ${queueDepth} exceeds normal threshold.`,
        affectedCandidateIds: [],
        affectedCandidateNames: [],
        recommendedAction: "Review queue bottlenecks across communication and paperwork.",
        responsibleEngine: "operations",
        owner: "Operations",
        confidence: 0.8,
        fetchedAt: input.fetchedAt,
      }),
    );
  }

  for (const engine of input.orchestrator.engineHealth) {
    if (engine.status === "offline") {
      issues.push(
        makeIssue({
          issueType: "engine_unavailable",
          severity: "critical",
          reason: `${engine.label} is offline: ${engine.explanation}`,
          affectedCandidateIds: [],
          affectedCandidateNames: [],
          recommendedAction: `Restore ${engine.label} or enable preview mode.`,
          responsibleEngine: mapOrchestratorEngine(engine.engineId),
          owner: "Platform Operations",
          confidence: 0.94,
          fetchedAt: input.fetchedAt,
        }),
      );
    }
  }

  const missingDataCount = input.workflowRows.filter((r) => !r.email?.trim()).length;
  if (missingDataCount > input.workflowRows.length * 0.1 && input.workflowRows.length > 5) {
    issues.push(
      makeIssue({
        issueType: "data_quality",
        severity: "medium",
        reason: `${missingDataCount} candidates missing required email data.`,
        affectedCandidateIds: [],
        affectedCandidateNames: [],
        recommendedAction: "Run data quality remediation on candidate records.",
        responsibleEngine: "recruiting",
        owner: "Data Operations",
        confidence: 0.82,
        fetchedAt: input.fetchedAt,
      }),
    );
  }

  return issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(severity: OperationsSeverity): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function mapOrchestratorEngine(
  engineId: string,
): OperationsEngineId {
  const map: Record<string, OperationsEngineId> = {
    recruiting_intelligence: "recruiting",
    paperwork_intelligence: "paperwork",
    paperwork_execution: "execution",
    communication: "communication",
    onboarding: "onboarding",
    executive: "executive",
  };
  return map[engineId] ?? "operations";
}
