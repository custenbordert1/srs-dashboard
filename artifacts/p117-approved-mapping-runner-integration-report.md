# P117 — Approved Mapping Bridge Runner Integration Plan

**Generated:** 2026-07-01T15:28:10.061Z  
**Mode:** dry-run only  
**GO/NO-GO:** GO

## Summary

P117 dry-run bridge plan — flag disabled. 6 approved P109 mappings loaded. Baseline project-mapping blocked: 316; bridge unlocked: 6 (when flag on). 6 candidate(s) bridge-applied in direct proof pass. GO: Default runner unchanged when flag off; bridge safe for dry-run only.

## P116 gap closure (dry-run)

P109 approved mappings affect P110/P111–P115 dry-run overlays but not classifyPaperworkBlocker in the runner path.

## Integration design

- **Approach:** Optional P117 bridge wraps classifyPaperworkBlocker with P110 overlay jobs when USE_APPROVED_MAPPING_BRIDGE_DRY_RUN=true and engine mode is dryRun only.
- **Insertion point:** buildAutonomousPaperworkReport candidate loop — swap classifier call when bridge active; default path unchanged.
- **Protection order:** already_sent, invalid_email, duplicate_risk evaluated in baseline before bridge overlay; protectionBlockerOverridesApproval prevents bridge unlock.
- **Future live path:** After dry-run validation, introduce separate USE_APPROVED_MAPPING_BRIDGE_LIVE flag with P101/P100 gate requirements — out of P117 scope.

## Flag

| Env var | Value | Active this run |
|---------|-------|-----------------|
| `USE_APPROVED_MAPPING_BRIDGE_DRY_RUN` | unset/false | no |

Constraints:

- Only active when env is exactly true
- Only applies when engine mode is dryRun
- Never applies for executeOne or executeSafeSingles

## Runner call-site trace

### P106.3 Runner

- **File:** `src/lib/autonomous-paperwork-runner/run-autonomous-paperwork-runner.ts`
- **Function:** `runAutonomousPaperworkRunnerCycle`
- **Calls:** `runAutonomousPaperworkEngine`
- Orchestrates ingestion sync, candidate selection, and P106 engine per cycle.

### P106 Engine

- **File:** `src/lib/p106-autonomous-paperwork-engine/run-autonomous-paperwork-engine.ts`
- **Function:** `runAutonomousPaperworkEngine`
- **Calls:** `buildAutonomousPaperworkReport`
- dryRun returns report only; executeOne calls controlled-live-send after auto-repair.

### P106 Report Builder

- **File:** `src/lib/p106-autonomous-paperwork-engine/build-autonomous-paperwork-report.ts`
- **Function:** `buildAutonomousPaperworkReport`
- **Calls:** `classifyPaperworkBlocker`, `resolveClosedAdProjectMapping`
- Primary production classification loop per candidate. P117 bridge hooks here when flag enabled.

### Classifier

- **File:** `src/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker.ts`
- **Function:** `classifyPaperworkBlocker`
- **Calls:** `resolveClosedAdProjectMapping`
- Ordered protection gates then closed-ad mapping inside classifier.

### Closed-Ad Recovery

- **File:** `src/lib/closed-ad-project-mapping/resolve-closed-ad-project-mapping.ts`
- **Function:** `resolveClosedAdProjectMapping`
- **Calls:** —
- Title/city/state heuristic; does not read P109 store today.

### P84 Eligibility

- **File:** `src/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility.ts`
- **Function:** `buildPaperworkSendEligibility`
- **Calls:** —
- Uses projectMapping from report builder after classification.

## Proof matrix

| Check | Result |
|-------|--------|
| Default runner unchanged when flag off | PASS |
| Bridge only when flag enabled | PASS |
| Non-approved decisions do not unlock | PASS |
| Protection overrides approval | PASS |
| No sends | PASS |
| No Breezy writes | PASS |
| No live mode | PASS |

## Metrics

| Metric | Value |
|--------|-------|
| Approved mappings loaded | 6 |
| Baseline project-mapping blocked | 316 |
| Bridge unlocked via approval | 6 |
| Bridge applied (direct proof) | 6 |
| Protection blocked bridge | 0 |
| Ready to send (baseline) | 1 |
| Ready to send (with bridge) | 1 |

## Sample bridge unlocks

- **Taryn Richardson** (`bfd12572f3e5`): project_not_mappable → p84_gate_failed
- **Marshall Woods** (`cde8b040e7a4`): project_not_mappable → p84_gate_failed
- **Katherine Duke** (`8fba13c8cf25`): project_not_mappable → p84_gate_failed
- **Kaelin Prusa** (`a364ab16b68e`): project_not_mappable → missing_resume
- **Angelique Cowan** (`7c37beb6ac48`): project_not_mappable → missing_resume

## Safety status

- p1063RunnerDefaultUnchanged: yes
- bridgeDryRunOnly: yes
- noBreezyWrites: yes
- noLiveSends: yes
- noLiveMode: yes
- liveRunnerUnwired: yes

## Non-goals (P117)

- No live executeOne bridge activation
- No Breezy writes
- No paperwork sends
- No AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE changes

