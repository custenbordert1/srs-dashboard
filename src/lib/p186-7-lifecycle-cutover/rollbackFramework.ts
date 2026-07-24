import type { P1867RollbackPlan } from "@/lib/p186-7-lifecycle-cutover/types";
import { readP1867Flags } from "@/lib/p186-7-lifecycle-cutover/flags";

const FORBIDS = [
  "resend paperwork",
  "duplicate MEL exports",
  "delete audit history",
  "silently overwrite production state",
] as const;

/**
 * Rollback framework — plans and simulates restoration; does not mutate production.
 */
export function buildRollbackPlans(): P1867RollbackPlan[] {
  return [
    {
      transitionGroup: "pre_paperwork_lifecycle",
      rollbackTrigger: "critical mismatch OR canary failure OR operator abort",
      rollbackFlag: "P186_ROLLBACK_CONTROLS + clear P186_LIFECYCLE_AUTHORITY_BY_TRANSITION_GROUP for group",
      previousAuthoritativeWriter: "api-candidates-workflows / production operators",
      stateReconstruction:
        "Re-read production workflow store as SoR; discard P186 authoritative intent; keep shadow observations",
      pendingOperationRecovery:
        "Leave unresolved P186 ops in review queue; do not auto-apply; operator resolves or cancels",
      auditPreservation: "Append rollback audit event; never delete prior p186_* or workflow audits",
      queuePreservation: "Operator queues retained; freeze any in-flight canary cohort",
      operatorNotification: "Surface rollback on cutover dashboard + operator queue banner",
      verificationSteps: [
        "Confirm P186 authority flags off for group",
        "Confirm production workflow SoR unchanged except intentional rollback writes via adapter",
        "Confirm no paperwork send invoked",
        "Confirm audit trail includes rollback event",
      ],
      forbids: [...FORBIDS],
    },
    {
      transitionGroup: "operator_approval",
      rollbackTrigger: "approval adapter failure OR audit gap OR operator abort",
      rollbackFlag: "P186_ROLLBACK_CONTROLS",
      previousAuthoritativeWriter: "p97-approval-mode-persist / api-candidates-workflows",
      stateReconstruction: "Restore prior approval status from workflow audit timeline",
      pendingOperationRecovery: "Cancel pending bulk approval previews; keep conflict review items",
      auditPreservation: "Preserve p186_operator_audit rows",
      queuePreservation: "Keep approval queues; mark canary cohort stopped",
      operatorNotification: "Notify executive/recruiter roles via dashboard",
      verificationSteps: [
        "Approval flags scoped off",
        "No duplicate approvals applied",
        "Audit + queue intact",
      ],
      forbids: [...FORBIDS],
    },
    {
      transitionGroup: "paperwork_send",
      rollbackTrigger: "never transfer authority away from P184/P185 incorrectly; abort legacy freeze if send path unhealthy",
      rollbackFlag: "P186_ROLLBACK_CONTROLS (re-enable legacy only if P184/P185 unavailable — operator explicit)",
      previousAuthoritativeWriter: "p184/p185 (preferred) or legacy send path under dry_run",
      stateReconstruction: "Do not invent Paperwork Sent; rely on envelope authority",
      pendingOperationRecovery: "Hold dry_run queues; never auto-live-send on rollback",
      auditPreservation: "Preserve P185 envelope audits",
      queuePreservation: "P185 runner queues retained",
      operatorNotification: "Paperwork isolation alert on cutover dashboard",
      verificationSteps: [
        "P184/P185 still isolated send authority",
        "No resend of existing envelopes",
        "Mode remains dry_run unless independently authorized",
      ],
      forbids: [...FORBIDS],
    },
    {
      transitionGroup: "post_sign_mel",
      rollbackTrigger: "post-sign adapter failure OR MEL queue integrity failure",
      rollbackFlag: "P186_ROLLBACK_CONTROLS",
      previousAuthoritativeWriter: "api-candidates-workflows / manual MEL process",
      stateReconstruction: "Revert Ready for MEL / MEL Export Review via approved adapter only when verified",
      pendingOperationRecovery: "Keep mel queue rows in pending_review; never call MEL write API",
      auditPreservation: "Preserve p186_5_audit and mel queue history",
      queuePreservation: "MEL export review queue retained",
      operatorNotification: "Post-sign / MEL rollback banner",
      verificationSteps: [
        "Automatic MEL export still disabled",
        "No confirmed_exported invented",
        "Audit + queue preserved",
      ],
      forbids: [...FORBIDS],
    },
  ];
}

export function simulateRollbackRestoration(input: {
  transitionGroup: string;
  productionStateBefore: string;
  productionStateAfterFailedCutover: string;
}): {
  restoredState: string;
  auditPreserved: true;
  queuePreserved: true;
  paperworkResent: false;
  melDuplicated: false;
  silentOverwrite: false;
  productionWritesAttempted: 0;
} {
  // Plan simulation only — prefer pre-cutover production state as reconstruction target
  return {
    restoredState: input.productionStateBefore,
    auditPreserved: true,
    queuePreserved: true,
    paperworkResent: false,
    melDuplicated: false,
    silentOverwrite: false,
    productionWritesAttempted: 0,
  };
}

export function executeRollback(input: {
  transitionGroup: string;
  forceFlags?: { rollbackControls: boolean };
}): {
  ok: false;
  executed: false;
  productionWritesAttempted: 0;
  detail: string;
} {
  const flags = readP1867Flags(
    input.forceFlags ? { rollbackControls: input.forceFlags.rollbackControls } : undefined,
  );
  if (!flags.rollbackControls) {
    return {
      ok: false,
      executed: false,
      productionWritesAttempted: 0,
      detail: "P186_ROLLBACK_CONTROLS flag is off",
    };
  }
  return {
    ok: false,
    executed: false,
    productionWritesAttempted: 0,
    detail: "P186.7 builds rollback plans only — no production rollback execution",
  };
}

export function assertRollbackForbids(): boolean {
  return buildRollbackPlans().every((p) =>
    FORBIDS.every((f) => p.forbids.includes(f)),
  );
}
