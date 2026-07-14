import {
  P1867_FREEZE_ORDER,
  type WriterControlRegistry,
} from "@/lib/p186-7-lifecycle-cutover/writerControlRegistry";
import { readP1867Flags } from "@/lib/p186-7-lifecycle-cutover/flags";
import type { P1867WriterControlRecord } from "@/lib/p186-7-lifecycle-cutover/types";

export type FreezeGateContext = {
  writerId: string;
  replacementHealthy: boolean;
  shadowParityOk: boolean;
  unresolvedOperations: number;
  activeLease: boolean;
  queuedWorkAtRisk: boolean;
  auditHistoryComplete: boolean;
  rollbackFlagExists: boolean;
  monitoringActive: boolean;
  operatorApprovalRecorded: boolean;
};

export type FreezeEvaluation = {
  writerId: string;
  freezeOrder: number | null;
  ready: boolean;
  blockedReasons: string[];
  wouldDisableNow: false;
};

/**
 * Evaluate freeze readiness — never actually freezes writers in P186.7.
 */
export function evaluateFreezeGates(
  ctx: FreezeGateContext,
  record?: P1867WriterControlRecord,
): FreezeEvaluation {
  const blocked: string[] = [];
  if (record?.neverFreeze) blocked.push("Writer is marked never-freeze (P184/P185/SoR)");
  if (ctx.writerId.startsWith("p184") || ctx.writerId.startsWith("p185")) {
    blocked.push("Do not freeze P184 or P185");
  }
  if (!ctx.replacementHealthy) blocked.push("Replacement path unhealthy");
  if (!ctx.shadowParityOk) blocked.push("Replacement path missing shadow parity");
  if (ctx.unresolvedOperations > 0) {
    blocked.push(`${ctx.unresolvedOperations} unresolved operations`);
  }
  if (ctx.activeLease) blocked.push("Active lease present");
  if (ctx.queuedWorkAtRisk) blocked.push("Queued work would be lost");
  if (!ctx.auditHistoryComplete) blocked.push("Audit history incomplete");
  if (!ctx.rollbackFlagExists) blocked.push("Rollback flag missing");
  if (!ctx.monitoringActive) blocked.push("Monitoring inactive");
  if (!ctx.operatorApprovalRecorded) blocked.push("Operator approval not recorded");

  const order = P1867_FREEZE_ORDER.indexOf(ctx.writerId);
  return {
    writerId: ctx.writerId,
    freezeOrder: order >= 0 ? order + 1 : null,
    ready: blocked.length === 0,
    blockedReasons: blocked,
    wouldDisableNow: false,
  };
}

/**
 * Attempt freeze control — refused unless flag on AND gates pass.
 * Even when "approved", P186.7 does not mutate production writer enablement.
 */
export function requestWriterFreeze(input: {
  registry: WriterControlRegistry;
  ctx: FreezeGateContext;
  forceFlags?: { writerFreezeControls: boolean };
}): {
  ok: boolean;
  evaluation: FreezeEvaluation;
  writersActuallyDisabled: 0;
  detail: string;
} {
  const flags = readP1867Flags(
    input.forceFlags ? { writerFreezeControls: input.forceFlags.writerFreezeControls } : undefined,
  );
  const record = input.registry.get(input.ctx.writerId);
  const evaluation = evaluateFreezeGates(input.ctx, record);

  if (!flags.writerFreezeControls) {
    return {
      ok: false,
      evaluation: {
        ...evaluation,
        ready: false,
        blockedReasons: ["P186_WRITER_FREEZE_CONTROLS flag is off", ...evaluation.blockedReasons],
      },
      writersActuallyDisabled: 0,
      detail: "Freeze controls disabled",
    };
  }

  if (!evaluation.ready) {
    if (record) {
      input.registry.upsert({
        ...record,
        freezeBlockedReasons: evaluation.blockedReasons,
        desiredStatus: "freeze_pending",
      });
    }
    return {
      ok: false,
      evaluation,
      writersActuallyDisabled: 0,
      detail: "Freeze refused — gates failed",
    };
  }

  // Plan-only: mark freeze_pending desire, never set frozen / disabledTimestamp in P186.7
  if (record) {
    input.registry.upsert({
      ...record,
      desiredStatus: "freeze_pending",
      freezeBlockedReasons: [],
      rollbackStatus: "ready",
      disabledTimestamp: null,
      currentStatus: record.currentStatus === "frozen" ? "active" : record.currentStatus,
    });
  }

  return {
    ok: true,
    evaluation,
    writersActuallyDisabled: 0,
    detail: "Freeze planned only — writer remains enabled (P186.7 safety wall)",
  };
}

export function classifyFreezeReadiness(
  registry: WriterControlRegistry,
  gateByWriter: Record<string, Omit<FreezeGateContext, "writerId">>,
): { freezeReady: FreezeEvaluation[]; freezeBlocked: FreezeEvaluation[] } {
  const freezeReady: FreezeEvaluation[] = [];
  const freezeBlocked: FreezeEvaluation[] = [];
  for (const writerId of P1867_FREEZE_ORDER) {
    const ctx = { writerId, ...(gateByWriter[writerId] ?? defaultBlockedGates()) };
    const evaluation = evaluateFreezeGates(ctx, registry.get(writerId));
    if (evaluation.ready) freezeReady.push(evaluation);
    else freezeBlocked.push(evaluation);
  }
  return { freezeReady, freezeBlocked };
}

function defaultBlockedGates(): Omit<FreezeGateContext, "writerId"> {
  return {
    replacementHealthy: false,
    shadowParityOk: false,
    unresolvedOperations: 1,
    activeLease: false,
    queuedWorkAtRisk: false,
    auditHistoryComplete: false,
    rollbackFlagExists: false,
    monitoringActive: false,
    operatorApprovalRecorded: false,
  };
}

export function getFreezeOrder(): readonly string[] {
  return P1867_FREEZE_ORDER;
}
