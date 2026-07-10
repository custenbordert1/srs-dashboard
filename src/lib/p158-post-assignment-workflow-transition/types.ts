import type { P1583TransitionAuditEvent } from "@/lib/p158-post-assignment-workflow-transition/transition-audit-store";
import type { P1583TransitionRollbackRecord } from "@/lib/p158-post-assignment-workflow-transition/transition-audit-store";

export type P1583TransitionCandidateRow = {
  candidateId: string;
  candidateName: string;
  eligible: boolean;
  blocked: boolean;
  alreadyTransitioned: boolean;
  blockers: string[];
  skipReason: string | null;
  beforeWorkflowStatus: string;
  beforeActionType: string | null;
  afterWorkflowStatus: string | null;
  afterActionType: string | null;
  postTransitionP157Action: string | null;
  postTransitionConfidence: number | null;
  transitioned: boolean;
  dryRun: boolean;
};

export type P1583TransitionRunResult = {
  ok: boolean;
  dryRun: boolean;
  message: string;
  transitionsCompleted: number;
  transitionsBlocked: number;
  transitionsSkipped: number;
  transitionsFailed: number;
  projectedSendPaperwork: number;
  candidates: P1583TransitionCandidateRow[];
  auditEvents: P1583TransitionAuditEvent[];
};

export type P1583TransitionReport = {
  generatedAt: string;
  readOnly: true;
  sourcePhase: "P158.3";
  transitionEnabled: boolean;
  summary: {
    transitionEligible: number;
    transitionBlocked: number;
    dryRunTransitionCount: number;
    projectedSendPaperwork: number;
    transitionsSkipped: number;
    transitionsFailed: number;
  };
  sections: {
    eligibleCandidates: P1583TransitionCandidateRow[];
    blockedCandidates: P1583TransitionCandidateRow[];
    postTransitionDecisions: P1583TransitionCandidateRow[];
    transitionAudit: P1583TransitionAuditEvent[];
    rollbackAvailable: P1583TransitionRollbackRecord[];
  };
  remainingBlockers: Array<{ candidateId: string; candidateName: string; blockers: string[] }>;
  dryRunResult: P1583TransitionRunResult;
  warnings: string[];
};
