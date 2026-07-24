# P186.7 Repository Retirement Plan

Identify only — **no deletions** in P186.7.

| Item | Path | Replacement | Safe removal phase | Rollback | Deleted now |
|---|---|---|---|---|---|
| P154.7 continuous recruiting runner | `src/lib/p154-continuous-autonomous-recruiting-runner` | P186 lifecycle control plane + P185 send | Stage 5 after observation | Restore module + feature flag; keep audit | false |
| P169 recruiting orchestrator | `src/lib/p169-autonomous-recruiting-orchestrator` | P186 lifecycle control plane | Stage 5 | Re-enable P169_ORCHESTRATOR_ENABLED under dry observation | false |
| P171 lifecycle manager production side-effects | `src/lib/p171-autonomous-candidate-lifecycle-manager` | P186.1 state machine + workflow SoR adapters | Stage 5 | Re-enable P171 flag in observe-only mode | false |
| P1061 autonomous paperwork runner interval | `src/lib/autonomous-paperwork-runner` | P185 production paperwork runner | Stage 5 | Do not resend; restore interval under dry_run only | false |
| P136 paperwork scheduler | `src/lib/p136-autonomous-paperwork-scheduler` | P185 | Stage 5 | Restore scheduler dry_run | false |
| P125 production runner | `src/lib/p125-autonomous-paperwork-production-runner` | P185 | Stage 5 | Restore under dry_run | false |
| P106 autonomous paperwork engine (legacy send) | `src/lib/p106-autonomous-paperwork-engine` | P184 send engine | Stage 5 | Prefer P184; do not revive live send casually | false |
| P183 final scoped operator send script | `scripts/p183-final-scoped-operator-send.ts` | P185 scoped operator send | Stage 5 | Archive script; do not auto-run | false |
| Duplicate paperwork APIs / unused interval runners | `src/app/api/**/autonomous-paperwork*/**` | P185 API surface | Stage 5 after Stage 4 observation | Restore routes behind flags | false |
| Legacy feature flags for continuous orchestrators | `env docs / flag readers for P154/P169/P171 continuous` | P186 transition-scoped authority flags | Stage 5 | Document rollback flag map | false |
| Stale rollout scripts / obsolete dashboard panels | `scripts/*rollout* / legacy executive panels` | P186 cutover + conflict + operator dashboards | Stage 5 | Keep panels behind collapsible until traffic zero | false |
