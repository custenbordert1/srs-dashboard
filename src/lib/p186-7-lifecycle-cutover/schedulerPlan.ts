/**
 * Future scheduler consolidation plan — not enabled in P186.7.
 */
export type SchedulerConsolidationPlan = {
  model: string;
  eventDriven: true;
  reconciliationJob: {
    cadence: "15_minutes";
    mode: "read_only";
    enabledNow: false;
  };
  competingIntervalOrchestrators: string[];
  durableLease: {
    name: string;
    singleLease: true;
    enabledNow: false;
  };
  idempotentReconciliationCycle: true;
  vercelHobbyCronDependency: "avoid_unless_external_scheduler_configured";
  schedulerActivatedNow: false;
  overlapsRemaining: string[];
};

export function buildSchedulerConsolidationPlan(): SchedulerConsolidationPlan {
  return {
    model:
      "Event-driven lifecycle processing + one 15-minute read-only reconciliation job under a single durable lease",
    eventDriven: true,
    reconciliationJob: {
      cadence: "15_minutes",
      mode: "read_only",
      enabledNow: false,
    },
    competingIntervalOrchestrators: [
      "p1547-continuous-recruiting-runner",
      "p169-recruiting-orchestrator",
      "p171-lifecycle-manager intervals",
      "p1061/p136/p125 legacy paperwork intervals",
      "p185 runner (isolated send — retain when authorized)",
    ],
    durableLease: {
      name: "p186-lifecycle-reconcile-lease",
      singleLease: true,
      enabledNow: false,
    },
    idempotentReconciliationCycle: true,
    vercelHobbyCronDependency: "avoid_unless_external_scheduler_configured",
    schedulerActivatedNow: false,
    overlapsRemaining: [
      "p1547 vs p169 continuous orchestration",
      "legacy paperwork intervals vs p185 runner",
      "p171 parallel lifecycle vs production workflow writers",
    ],
  };
}

/** Guard: reconciler scheduler flag must not activate scheduling in this phase. */
export function assertSchedulerNotActivated(reconcilerSchedulerFlag: boolean): {
  activated: false;
  detail: string;
} {
  return {
    activated: false,
    detail: reconcilerSchedulerFlag
      ? "Flag may be on in tests, but P186.7 still does not start schedulers"
      : "P186_RECONCILER_SCHEDULER off — no scheduler activation",
  };
}
