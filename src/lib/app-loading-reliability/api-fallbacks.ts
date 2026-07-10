import { P156_SOURCE_PHASE, type P156PrioritizedQueue, type P156QueueFilters } from "@/lib/p156-candidate-prioritization/types";
import { P157_SOURCE_PHASE, type P157DecisionDashboard, type P157DecisionFilters } from "@/lib/p157-recruiter-decision-engine/types";
import { P158_SOURCE_PHASE, type P158AssignmentDashboard } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { P155_SOURCE_PHASE, type P155OperationsDashboard } from "@/lib/p155-autopilot-operations-dashboard/types";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import type { P1547AutopilotStatusResponse } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

const now = () => new Date().toISOString();

const EMPTY_P156_SECTIONS = {
  topPriority: [],
  highestRiskPositions: [],
  highestDemandMarkets: [],
  readyForPaperwork: [],
  awaitingRecruiter: [],
  awaitingFollowUp: [],
  readyForMel: [],
};

export function emptyP156Queue(filters: P156QueueFilters): P156PrioritizedQueue {
  return {
    generatedAt: now(),
    readOnly: true,
    sourcePhase: P156_SOURCE_PHASE,
    filters,
    candidates: [],
    sections: EMPTY_P156_SECTIONS,
    filterOptions: { recruiters: [], dms: [], states: [], projects: [], stages: [] },
    warnings: ["Degraded empty queue — classification timed out"],
  };
}

export function emptyP157Dashboard(filters: P157DecisionFilters): P157DecisionDashboard {
  return {
    generatedAt: now(),
    readOnly: true,
    sourcePhase: P157_SOURCE_PHASE,
    filters,
    summary: {
      totalCandidates: 0,
      highConfidenceCount: 0,
      manualReviewCount: 0,
      blockedCount: 0,
      topAction: null,
      avgConfidence: 0,
    },
    decisions: [],
    sections: {
      recommendedActions: [],
      highConfidence: [],
      manualReview: [],
      needsRecruiter: [],
      needsDm: [],
      needsPaperwork: [],
      readyForMel: [],
      blocked: [],
      top25: [],
    },
    distribution: [],
    filterOptions: { recruiters: [], dms: [], states: [], projects: [], decisions: [] },
    warnings: ["Degraded empty dashboard — decision engine timed out"],
  };
}

export function emptyP158Dashboard(): P158AssignmentDashboard {
  return {
    generatedAt: now(),
    readOnly: true,
    sourcePhase: P158_SOURCE_PHASE,
    simulationMode: true,
    productionEnabled: false,
    summary: {
      totalEvaluated: 0,
      assignmentQueue: 0,
      highConfidence: 0,
      manualReview: 0,
      skippedExisting: 0,
      blocked: 0,
      todaysAssignments: 0,
      avgConfidence: 0,
    },
    sections: {
      assignmentQueue: [],
      highConfidence: [],
      manualReview: [],
      recruiterWorkload: [],
      territoryBalance: [],
      assignmentHistory: [],
      todaysAssignments: [],
      assignmentAudit: [],
    },
    warnings: ["Degraded empty dashboard — assignment center timed out"],
  };
}

export function emptyP155Dashboard(): P155OperationsDashboard {
  return {
    sourcePhase: P155_SOURCE_PHASE,
    generatedAt: now(),
    status: {
      enabled: false,
      continuousEnabled: false,
      runnerStatus: "disabled",
      lastRunAt: null,
      nextRunAt: null,
      uptimeMs: null,
      serverStartTime: null,
      intervalMinutes: 0,
      maxSendsPerCycle: 10,
      maxAssignmentsPerCycle: 0,
      processingLockHeld: false,
      lastError: "Degraded snapshot",
    },
    today: {
      candidatesEvaluated: 0,
      recruitersAssigned: 0,
      paperworkSent: 0,
      paperworkSigned: 0,
      activeSignatureRequests: 0,
      duplicatesPrevented: 0,
      failures: 0,
    },
    queue: {
      eligibleForPaperwork: 0,
      waitingOnSignature: 0,
      signedToday: 0,
      invalidEmail: 0,
      duplicateCandidates: 0,
      manualReview: 0,
      disqualifiedArchived: 0,
      needsRecruiterAssignment: 0,
      queueRemaining: 0,
    },
  };
}

export async function degradedP1547RunnerStatus(): Promise<P1547AutopilotStatusResponse> {
  const state = await loadP1547RunnerState();
  return {
    ok: state.currentStatus !== "error",
    runnerStatus: state.currentStatus,
    continuousEnabled: state.continuousEnabled,
    lastCycle: state.recentCycles[0] ?? null,
    nextCycleAt: state.nextRun,
    currentQueue: state.queueRemaining,
    todaysSends: state.dailyMetrics.sent,
    todaysSignatures: state.dailyMetrics.signaturesCompleted,
    errors: state.dailyMetrics.errors,
    uptimeMs: state.serverStartTime ? Date.now() - Date.parse(state.serverStartTime) : null,
    serverStartTime: state.serverStartTime,
    state,
  };
}
