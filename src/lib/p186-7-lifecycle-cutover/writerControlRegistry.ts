import type {
  P1867WriterControlRecord,
  P1867WriterControlStatus,
} from "@/lib/p186-7-lifecycle-cutover/types";

/** Ordered freeze targets from requirements — never includes P184/P185. */
export const P1867_FREEZE_ORDER: readonly string[] = [
  "p1547-continuous-recruiting-runner",
  "p169-recruiting-orchestrator",
  "p171-lifecycle-manager",
  "p1061-autonomous-paperwork-runner",
  "p136-paperwork-scheduler",
  "p125-production-runner",
  "p106-autonomous-paperwork-engine",
  "p183-final-scoped-operator-send",
] as const;

const NEVER_FREEZE = new Set([
  "p184-autonomous-paperwork-send-engine",
  "p185-production-paperwork-runner",
  "dropbox-sign-webhook",
  "candidate-workflow-store-core",
  "onboarding-send-execute",
]);

type Seed = {
  writerId: string;
  module: string;
  transitionsOwned: string[];
  featureFlag: string | null;
  dependency: string | null;
  replacementWriter: string;
  healthStatus: "healthy" | "degraded" | "unknown";
  currentStatus?: P1867WriterControlStatus;
  desiredStatus?: P1867WriterControlStatus;
  neverFreeze?: boolean;
};

const SEEDS: Seed[] = [
  {
    writerId: "p1547-continuous-recruiting-runner",
    module: "p154-continuous-autonomous-recruiting-runner",
    transitionsOwned: ["continuous_cycle"],
    featureFlag: "P154_CONTINUOUS_ENABLED",
    dependency: "p154-controlled-autopilot",
    replacementWriter: "p186-lifecycle-control-plane + P185 send",
    healthStatus: "unknown",
    desiredStatus: "freeze_pending",
  },
  {
    writerId: "p169-recruiting-orchestrator",
    module: "p169-autonomous-recruiting-orchestrator",
    transitionsOwned: ["orchestrator_cycle"],
    featureFlag: "P169_ORCHESTRATOR_ENABLED",
    dependency: "p159-operations-control-center",
    replacementWriter: "p186-lifecycle-control-plane",
    healthStatus: "unknown",
    desiredStatus: "freeze_pending",
  },
  {
    writerId: "p171-lifecycle-manager",
    module: "p171-autonomous-candidate-lifecycle-manager",
    transitionsOwned: ["p171_parallel_lifecycle"],
    featureFlag: "P171_LIFECYCLE_ENABLED",
    dependency: null,
    replacementWriter: "p186-1-lifecycle-state-machine (shadow) + workflow SoR",
    healthStatus: "unknown",
    desiredStatus: "freeze_pending",
  },
  {
    writerId: "p1061-autonomous-paperwork-runner",
    module: "autonomous-paperwork-runner",
    transitionsOwned: ["Paperwork Needed→Paperwork Sent"],
    featureFlag: "AUTONOMOUS_PAPERWORK_RUNNER_SCHEDULE_ENABLED",
    dependency: "p106-autonomous-paperwork-engine",
    replacementWriter: "p185-production-paperwork-runner",
    healthStatus: "unknown",
    desiredStatus: "freeze_pending",
  },
  {
    writerId: "p136-paperwork-scheduler",
    module: "p136-autonomous-paperwork-scheduler",
    transitionsOwned: ["Paperwork Needed→Paperwork Sent"],
    featureFlag: null,
    dependency: "p123-paperwork-cycle-orchestrator",
    replacementWriter: "p185-production-paperwork-runner",
    healthStatus: "unknown",
    desiredStatus: "freeze_pending",
  },
  {
    writerId: "p125-production-runner",
    module: "p125-autonomous-paperwork-production-runner",
    transitionsOwned: ["Paperwork Needed→Paperwork Sent"],
    featureFlag: "P125_RUNNER_CONTINUOUS_ENABLED",
    dependency: "p123-paperwork-cycle-orchestrator",
    replacementWriter: "p185-production-paperwork-runner",
    healthStatus: "unknown",
    desiredStatus: "freeze_pending",
  },
  {
    writerId: "p106-autonomous-paperwork-engine",
    module: "p106-autonomous-paperwork-engine",
    transitionsOwned: ["Paperwork Needed→Paperwork Sent"],
    featureFlag: "P84_LIVE_SEND",
    dependency: null,
    replacementWriter: "p184-autonomous-paperwork-send-engine",
    healthStatus: "unknown",
    desiredStatus: "freeze_pending",
  },
  {
    writerId: "p183-final-scoped-operator-send",
    module: "scripts/p183-final-scoped-operator-send.ts",
    transitionsOwned: ["Paperwork Needed→Paperwork Sent"],
    featureFlag: "P154_CONTINUOUS_ENABLED",
    dependency: "p159-operations-control-center",
    replacementWriter: "p185-production-paperwork-runner",
    healthStatus: "unknown",
    desiredStatus: "freeze_pending",
  },
  {
    writerId: "p184-autonomous-paperwork-send-engine",
    module: "p184-autonomous-paperwork-send-engine",
    transitionsOwned: ["Paperwork Needed→Paperwork Sent"],
    featureFlag: "P185_PRODUCTION_AUTOMATION_ENABLED",
    dependency: "onboarding-send-execute",
    replacementWriter: "self (keep)",
    healthStatus: "healthy",
    currentStatus: "active",
    desiredStatus: "active",
    neverFreeze: true,
  },
  {
    writerId: "p185-production-paperwork-runner",
    module: "p185-production-paperwork-automation-runner",
    transitionsOwned: ["Paperwork Needed→Paperwork Sent", "envelope_lifecycle"],
    featureFlag: "P185_PRODUCTION_AUTOMATION_ENABLED",
    dependency: "p184-autonomous-paperwork-send-engine",
    replacementWriter: "self (keep)",
    healthStatus: "healthy",
    currentStatus: "active",
    desiredStatus: "active",
    neverFreeze: true,
  },
  {
    writerId: "p186-1-lifecycle-state-machine",
    module: "p186-1-lifecycle-state-machine",
    transitionsOwned: ["shadow_lifecycle_*"],
    featureFlag: null,
    dependency: null,
    replacementWriter: "self (shadow)",
    healthStatus: "healthy",
    currentStatus: "shadow_observe",
    desiredStatus: "shadow_observe",
  },
  {
    writerId: "candidate-workflow-store-core",
    module: "candidate-workflow-store",
    transitionsOwned: ["*→production_workflow"],
    featureFlag: null,
    dependency: null,
    replacementWriter: "self (SoR)",
    healthStatus: "healthy",
    currentStatus: "active",
    desiredStatus: "active",
    neverFreeze: true,
  },
];

/**
 * Durable-shaped writer control registry (in-memory plan store).
 * Does NOT disable production writers.
 */
export class WriterControlRegistry {
  private readonly byId = new Map<string, P1867WriterControlRecord>();

  constructor(seed: readonly Seed[] = SEEDS) {
    for (const s of seed) {
      const freezeOrderIdx = P1867_FREEZE_ORDER.indexOf(s.writerId);
      this.byId.set(s.writerId, {
        writerId: s.writerId,
        module: s.module,
        transitionsOwned: s.transitionsOwned,
        currentStatus: s.currentStatus ?? "active",
        desiredStatus: s.desiredStatus ?? "active",
        featureFlag: s.featureFlag,
        dependency: s.dependency,
        replacementWriter: s.replacementWriter,
        freezeOrder: freezeOrderIdx >= 0 ? freezeOrderIdx + 1 : null,
        disabledTimestamp: null,
        rollbackStatus: s.neverFreeze ? "n/a" : "untested",
        lastObservedWrite: null,
        healthStatus: s.healthStatus,
        freezeBlockedReasons: [],
        neverFreeze: s.neverFreeze || NEVER_FREEZE.has(s.writerId),
      });
    }
  }

  list(): P1867WriterControlRecord[] {
    return [...this.byId.values()].sort(
      (a, b) => (a.freezeOrder ?? 999) - (b.freezeOrder ?? 999) || a.writerId.localeCompare(b.writerId),
    );
  }

  get(writerId: string): P1867WriterControlRecord | undefined {
    return this.byId.get(writerId);
  }

  upsert(record: P1867WriterControlRecord): void {
    this.byId.set(record.writerId, { ...record });
  }

  /** Persistence-shaped snapshot for tests / artifacts. */
  toJSON(): P1867WriterControlRecord[] {
    return this.list();
  }

  static fromJSON(rows: P1867WriterControlRecord[]): WriterControlRegistry {
    const reg = new WriterControlRegistry([]);
    for (const row of rows) reg.upsert(row);
    return reg;
  }
}

export function createDefaultWriterControlRegistry(): WriterControlRegistry {
  return new WriterControlRegistry();
}
