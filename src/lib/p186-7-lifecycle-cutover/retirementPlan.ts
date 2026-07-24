import type { P1867RetirementItem } from "@/lib/p186-7-lifecycle-cutover/types";

/**
 * Repository retirement / archival plan — identify only; delete nothing in P186.7.
 */
export function buildRepositoryRetirementPlan(): P1867RetirementItem[] {
  return [
    {
      item: "P154.7 continuous recruiting runner",
      path: "src/lib/p154-continuous-autonomous-recruiting-runner",
      replacement: "P186 lifecycle control plane + P185 send",
      dependencyCheck: "No active leases; freeze order #1 gates pass",
      safeRemovalPhase: "Stage 5 after observation",
      rollbackRequirement: "Restore module + feature flag; keep audit",
      deletedNow: false,
    },
    {
      item: "P169 recruiting orchestrator",
      path: "src/lib/p169-autonomous-recruiting-orchestrator",
      replacement: "P186 lifecycle control plane",
      dependencyCheck: "P159 control center no longer depends on P169 cycle",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Re-enable P169_ORCHESTRATOR_ENABLED under dry observation",
      deletedNow: false,
    },
    {
      item: "P171 lifecycle manager production side-effects",
      path: "src/lib/p171-autonomous-candidate-lifecycle-manager",
      replacement: "P186.1 state machine + workflow SoR adapters",
      dependencyCheck: "Shadow parity healthy; no unresolved ops",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Re-enable P171 flag in observe-only mode",
      deletedNow: false,
    },
    {
      item: "P1061 autonomous paperwork runner interval",
      path: "src/lib/autonomous-paperwork-runner",
      replacement: "P185 production paperwork runner",
      dependencyCheck: "P185 healthy; dry_run unless authorized",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Do not resend; restore interval under dry_run only",
      deletedNow: false,
    },
    {
      item: "P136 paperwork scheduler",
      path: "src/lib/p136-autonomous-paperwork-scheduler",
      replacement: "P185",
      dependencyCheck: "No queued work at risk",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Restore scheduler dry_run",
      deletedNow: false,
    },
    {
      item: "P125 production runner",
      path: "src/lib/p125-autonomous-paperwork-production-runner",
      replacement: "P185",
      dependencyCheck: "P125 continuous flag off in prod before delete",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Restore under dry_run",
      deletedNow: false,
    },
    {
      item: "P106 autonomous paperwork engine (legacy send)",
      path: "src/lib/p106-autonomous-paperwork-engine",
      replacement: "P184 send engine",
      dependencyCheck: "No live P84_LIVE_SEND dependency",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Prefer P184; do not revive live send casually",
      deletedNow: false,
    },
    {
      item: "P183 final scoped operator send script",
      path: "scripts/p183-final-scoped-operator-send.ts",
      replacement: "P185 scoped operator send",
      dependencyCheck: "Superseded by P185 paths",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Archive script; do not auto-run",
      deletedNow: false,
    },
    {
      item: "Duplicate paperwork APIs / unused interval runners",
      path: "src/app/api/**/autonomous-paperwork*/**",
      replacement: "P185 API surface",
      dependencyCheck: "Route inventory + traffic review",
      safeRemovalPhase: "Stage 5 after Stage 4 observation",
      rollbackRequirement: "Restore routes behind flags",
      deletedNow: false,
    },
    {
      item: "Legacy feature flags for continuous orchestrators",
      path: "env docs / flag readers for P154/P169/P171 continuous",
      replacement: "P186 transition-scoped authority flags",
      dependencyCheck: "No production dependency on legacy flags",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Document rollback flag map",
      deletedNow: false,
    },
    {
      item: "Stale rollout scripts / obsolete dashboard panels",
      path: "scripts/*rollout* / legacy executive panels",
      replacement: "P186 cutover + conflict + operator dashboards",
      dependencyCheck: "UI traffic / bookmark review",
      safeRemovalPhase: "Stage 5",
      rollbackRequirement: "Keep panels behind collapsible until traffic zero",
      deletedNow: false,
    },
  ];
}

export function assertNothingDeleted(plan: P1867RetirementItem[]): boolean {
  return plan.every((i) => i.deletedNow === false);
}
