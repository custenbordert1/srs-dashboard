import type { P1863ApprovalGateFailure, P1863OperatorAction } from "@/lib/p186-3-operator-lifecycle-queues/types";
import type { P1863SourceRow } from "@/lib/p186-3-operator-lifecycle-queues/queues";

export type ApprovalGateContext = {
  action: P1863OperatorAction;
  row: P1863SourceRow;
  expectedProductionStates?: string[];
  operatorAuthorized: boolean;
  alreadyApproved?: boolean;
  conflictingOperation?: boolean;
};

export function evaluateApprovalGates(
  ctx: ApprovalGateContext,
): { ok: true } | { ok: false; failures: P1863ApprovalGateFailure[] } {
  const failures: P1863ApprovalGateFailure[] = [];
  if (!ctx.row.candidateId?.trim()) {
    failures.push({ code: "identity_unresolved", message: "Candidate identity not resolved." });
  }
  if (!ctx.row.productionState && !ctx.row.shadowState) {
    failures.push({ code: "production_missing", message: "Production record missing." });
  }
  if (!ctx.operatorAuthorized) {
    failures.push({ code: "unauthorized", message: "Operator not authorized for this action." });
  }
  if (ctx.row.withdrawn) {
    failures.push({ code: "withdrawn", message: "Candidate is withdrawn." });
  }
  if (ctx.row.archived) {
    failures.push({ code: "archived", message: "Candidate is archived." });
  }
  if (ctx.alreadyApproved) {
    failures.push({ code: "duplicate_approval", message: "Duplicate approval prevented." });
  }
  if (ctx.conflictingOperation) {
    failures.push({ code: "conflicting_operation", message: "Active conflicting operation." });
  }
  const holds = ctx.row.holdFlags ?? [];
  if (holds.some((h) => /executive|recruiter|dm|client/i.test(h)) && ctx.action !== "remove_hold") {
    failures.push({
      code: "hold_conflict",
      message: `Hold conflict: ${holds.join(", ")}`,
    });
  }
  if (ctx.expectedProductionStates?.length) {
    const current = (ctx.row.productionState ?? "").trim();
    const ok = ctx.expectedProductionStates.some(
      (s) => s.toLowerCase() === current.toLowerCase(),
    );
    if (!ok) {
      failures.push({
        code: "stale_production_state",
        message: `Production state "${current || "(empty)"}" does not match expected [${ctx.expectedProductionStates.join(", ")}].`,
      });
    }
  }
  if (failures.length) return { ok: false, failures };
  return { ok: true };
}

export function expectedStatesForAction(action: P1863OperatorAction): string[] | undefined {
  switch (action) {
    case "approve_hiring_recommendation":
      return ["Qualified", "Needs Review", "Applied", "Paperwork Needed"];
    case "reject_hiring_recommendation":
      return ["Qualified", "Needs Review", "Applied"];
    case "return_to_recruiter":
      return ["Qualified", "Needs Review", "Paperwork Needed", "Applied"];
    case "mark_paperwork_review_approved":
      return ["Paperwork Needed", "Qualified"];
    case "mark_mel_ready_review_approved":
      return ["Signed", "Awaiting DD Verification", "Ready for MEL"];
    default:
      return undefined;
  }
}
