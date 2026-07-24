import { randomUUID } from "node:crypto";
import type {
  AuditEvent,
  AuditEventKind,
  AuditEventLinks,
  OrchestrationTimelineEntry,
} from "@/lib/candidate-evaluation-orchestrator/types";

/**
 * Unified audit emitter for evaluate → decide → plan.
 * Soft-links to P71 execution audit and security audit without writing those stores
 * during dry-run (callers may persist links later under operator-authorized phases).
 */
export class EvaluationAuditLog {
  private readonly events: AuditEvent[] = [];
  private seq = 0;
  readonly traceId: string;
  readonly batchId: string | null;

  constructor(input?: { traceId?: string; batchId?: string | null }) {
    this.traceId = input?.traceId ?? randomUUID();
    this.batchId = input?.batchId ?? null;
  }

  record(
    kind: AuditEventKind,
    message: string,
    details: Record<string, unknown> = {},
    candidateId: string | null = null,
    links: AuditEventLinks = {},
  ): AuditEvent {
    this.seq += 1;
    const event: AuditEvent = {
      eventId: randomUUID(),
      traceId: this.traceId,
      batchId: this.batchId,
      seq: this.seq,
      kind,
      candidateId,
      timestamp: new Date().toISOString(),
      message,
      details,
      links: {
        p71ExecutionAuditId: links.p71ExecutionAuditId ?? null,
        securityAuditAction: links.securityAuditAction ?? null,
        paperworkCycleId: links.paperworkCycleId ?? null,
        p240TraceId: links.p240TraceId ?? null,
      },
    };
    this.events.push(event);
    return event;
  }

  /** Record soft data-quality findings (never a hard failure). */
  recordDataQuality(input: {
    candidateId: string;
    score: number;
    grade: string;
    summary: string;
    issues: Array<{ code: string; reason: string; severity: string }>;
  }): AuditEvent {
    return this.record(
      "data_quality",
      input.summary,
      {
        score: input.score,
        grade: input.grade,
        issues: input.issues,
      },
      input.candidateId,
      { securityAuditAction: "recommendation_action" },
    );
  }

  /** Record P204 evaluation trace + reason codes. */
  recordEvaluation(input: {
    candidateId: string;
    redactedCandidateId: string;
    recommendation: string;
    confidence: number;
    reasonCodes: string[];
    evidence: string[];
  }): AuditEvent {
    return this.record(
      "evaluation",
      `P204 ${input.recommendation} conf=${input.confidence} (${input.redactedCandidateId})`,
      {
        recommendation: input.recommendation,
        confidence: input.confidence,
        reasonCodes: input.reasonCodes,
        evidence: input.evidence.slice(0, 8),
      },
      input.candidateId,
      { securityAuditAction: "recommendation_action" },
    );
  }

  /** Record decision rationale (CEO bands). */
  recordDecision(input: {
    candidateId: string;
    outcome: string;
    explanation: string[];
    automationReady: boolean;
  }): AuditEvent {
    return this.record(
      "decision",
      `Decision ${input.outcome} automationReady=${input.automationReady}`,
      {
        outcome: input.outcome,
        explanation: input.explanation,
        automationReady: input.automationReady,
      },
      input.candidateId,
      { securityAuditAction: "workflow_action" },
    );
  }

  /** Record paperwork task planning (links to P71 when an execution audit id exists). */
  recordPaperworkPlan(input: {
    candidateId: string;
    taskCount: number;
    idempotencyKeys: string[];
    p71ExecutionAuditId?: string | null;
    paperworkCycleId?: string | null;
  }): AuditEvent {
    return this.record(
      "paperwork_plan",
      `Planned ${input.taskCount} paperwork task(s)`,
      {
        taskCount: input.taskCount,
        idempotencyKeys: input.idempotencyKeys,
      },
      input.candidateId,
      {
        p71ExecutionAuditId: input.p71ExecutionAuditId ?? null,
        paperworkCycleId: input.paperworkCycleId ?? null,
        securityAuditAction: "onboarding_send_packet",
      },
    );
  }

  list(): AuditEvent[] {
    return [...this.events];
  }

  timeline(): OrchestrationTimelineEntry[] {
    return this.events.map((e) => ({
      at: e.timestamp,
      kind: e.kind,
      message: e.message,
      candidateId: e.candidateId,
      seq: e.seq,
    }));
  }
}

/** @deprecated Use EvaluationAuditLog — alias retained for clarity in docs. */
export const UnifiedAuditEmitter = EvaluationAuditLog;
