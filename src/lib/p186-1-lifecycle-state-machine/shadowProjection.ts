import { LifecycleStateMachine } from "@/lib/p186-1-lifecycle-state-machine/lifecycleStateMachine";
import { applyP1861Migrations } from "@/lib/p186-1-lifecycle-state-machine/migrate";
import { isLegalTransition, deriveExpectedLifecycleState, happyPathIndex } from "@/lib/p186-1-lifecycle-state-machine/states";
import type {
  P186LifecycleState,
  P186ProductionCandidateSnapshot,
  P186ShadowFinding,
  P186ShadowProjectionResult,
} from "@/lib/p186-1-lifecycle-state-machine/types";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

/**
 * ShadowProjectionEngine — observes production snapshots, maintains shadow FSM,
 * and records match/mismatch findings. Never mutates production workflow or P184/P185.
 */
export class ShadowProjectionEngine {
  constructor(private readonly client?: SqlClient) {}

  private async db(): Promise<SqlClient> {
    const db = this.client ?? (await createSqlClient());
    await applyP1861Migrations(db);
    return db;
  }

  async project(
    snapshots: P186ProductionCandidateSnapshot[],
  ): Promise<P186ShadowProjectionResult> {
    const db = await this.db();
    const machine = new LifecycleStateMachine(db);
    const projectedAt = new Date().toISOString();
    const findings: P186ShadowFinding[] = [];

    let matches = 0;
    let mismatches = 0;
    let duplicateTransitions = 0;
    let invalidTransitions = 0;
    let missingTransitions = 0;
    let impossibleTransitions = 0;

    for (const snap of snapshots) {
      const productionDerived = deriveExpectedLifecycleState(snap);
      const shadow = await machine.records.get(snap.candidateId);
      const shadowState = shadow?.state ?? null;

      if (shadowState == null) {
        // Seed shadow to production-derived via stepwise apply when possible
        const seed = await this.seedToState(machine, snap.candidateId, productionDerived);
        if (seed.kind === "match") {
          matches += 1;
          findings.push({
            candidateId: snap.candidateId,
            kind: "match",
            productionDerivedState: productionDerived,
            shadowState: productionDerived,
            detail: "Shadow seeded to production-derived state.",
            at: projectedAt,
          });
        } else {
          missingTransitions += 1;
          findings.push({
            candidateId: snap.candidateId,
            kind: "missing_transition",
            productionDerivedState: productionDerived,
            shadowState: null,
            detail: seed.detail,
            at: projectedAt,
          });
        }
        continue;
      }

      if (shadowState === productionDerived) {
        matches += 1;
        findings.push({
          candidateId: snap.candidateId,
          kind: "match",
          productionDerivedState: productionDerived,
          shadowState,
          detail: "Shadow matches production-derived state.",
          at: projectedAt,
        });
        continue;
      }

      // Attempt legal advance toward production-derived
      if (isLegalTransition(shadowState, productionDerived)) {
        const eventId = `shadow:${snap.candidateId}:${shadowState}:${productionDerived}:${projectedAt}`;
        const result = await machine.apply({
          candidateId: snap.candidateId,
          toState: productionDerived,
          actor: "system:shadow",
          source: "shadow_projection",
          reason: `Shadow advance to match production-derived ${productionDerived}`,
          eventId,
          correlationId: eventId,
          at: projectedAt,
        });
        if (result.applied) {
          matches += 1;
          findings.push({
            candidateId: snap.candidateId,
            kind: "match",
            productionDerivedState: productionDerived,
            shadowState: productionDerived,
            detail: `Shadow advanced ${shadowState} → ${productionDerived}.`,
            at: projectedAt,
          });
        } else if (result.validation.code === "duplicate_event") {
          duplicateTransitions += 1;
          findings.push({
            candidateId: snap.candidateId,
            kind: "duplicate_transition",
            productionDerivedState: productionDerived,
            shadowState,
            detail: result.validation.message,
            at: projectedAt,
          });
        } else {
          invalidTransitions += 1;
          findings.push({
            candidateId: snap.candidateId,
            kind: "invalid_transition",
            productionDerivedState: productionDerived,
            shadowState,
            detail: result.validation.message,
            at: projectedAt,
          });
        }
        continue;
      }

      const fromIdx = happyPathIndex(shadowState);
      const toIdx = happyPathIndex(productionDerived);
      if (
        shadowState !== "BLOCKED" &&
        productionDerived !== "BLOCKED" &&
        fromIdx >= 0 &&
        toIdx >= 0 &&
        toIdx < fromIdx
      ) {
        impossibleTransitions += 1;
        findings.push({
          candidateId: snap.candidateId,
          kind: "impossible_transition",
          productionDerivedState: productionDerived,
          shadowState,
          detail: `Production-derived ${productionDerived} is behind shadow ${shadowState}.`,
          at: projectedAt,
        });
        mismatches += 1;
        continue;
      }

      // Skip / multi-step gap — record missing intermediate transitions
      missingTransitions += 1;
      mismatches += 1;
      findings.push({
        candidateId: snap.candidateId,
        kind: "mismatch",
        productionDerivedState: productionDerived,
        shadowState,
        detail: `Cannot legally move ${shadowState} → ${productionDerived} in one step (missing intermediates or policy gap).`,
        at: projectedAt,
      });
    }

    await db.query(
      `INSERT INTO p186_shadow_runs (
         projected_at, evaluated, matches, mismatches, duplicate_transitions,
         invalid_transitions, missing_transitions, impossible_transitions, payload
       ) VALUES ($1::timestamptz,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        projectedAt,
        snapshots.length,
        matches,
        mismatches,
        duplicateTransitions,
        invalidTransitions,
        missingTransitions,
        impossibleTransitions,
        JSON.stringify({ findingCount: findings.length }),
      ],
    );

    for (const f of findings) {
      await db.query(
        `INSERT INTO p186_shadow_findings (
           candidate_id, kind, production_derived_state, shadow_state, detail, at
         ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz)`,
        [
          f.candidateId,
          f.kind,
          f.productionDerivedState,
          f.shadowState,
          f.detail,
          f.at,
        ],
      );
    }

    return {
      evaluated: snapshots.length,
      matches,
      mismatches,
      duplicateTransitions,
      invalidTransitions,
      missingTransitions,
      impossibleTransitions,
      findings,
      projectedAt,
    };
  }

  private async seedToState(
    machine: LifecycleStateMachine,
    candidateId: string,
    target: P186LifecycleState,
  ): Promise<{ kind: "match" | "missing_transition"; detail: string }> {
    // Walk happy path from APPLIED to target when possible
    const path = buildPathTo(target);
    let current: P186LifecycleState | null = null;
    for (const step of path) {
      const eventId = `shadow-seed:${candidateId}:${current ?? "none"}:${step}`;
      const result = await machine.apply({
        candidateId,
        toState: step,
        actor: "system:shadow",
        source: "shadow_projection",
        reason: `Shadow seed step → ${step}`,
        eventId,
        at: new Date().toISOString(),
      });
      if (!result.applied && result.validation.code !== "noop_same_state") {
        return {
          kind: "missing_transition",
          detail: `Failed seeding at ${current ?? "(none)"} → ${step}: ${result.validation.message}`,
        };
      }
      current = step;
    }
    return { kind: "match", detail: `Seeded to ${target}` };
  }
}

function buildPathTo(target: P186LifecycleState): P186LifecycleState[] {
  if (target === "BLOCKED") return ["APPLIED", "BLOCKED"];
  const order = [
    "APPLIED",
    "RECRUITER_REVIEW",
    "HIRING_RECOMMENDATION",
    "OPERATOR_APPROVED",
    "PAPERWORK_NEEDED",
    "PAPERWORK_SENT",
    "VIEWED",
    "SIGNED",
    "ONBOARDING_COMPLETE",
    "READY_FOR_MEL",
    "EXPORTED",
  ] as const;
  const idx = order.indexOf(target as (typeof order)[number]);
  if (idx < 0) return ["APPLIED"];
  // VIEWED is optional — if target is SIGNED or beyond, skip VIEWED in seed path
  // by using legal shortcuts: PAPERWORK_SENT → SIGNED
  const path: P186LifecycleState[] = [];
  for (let i = 0; i <= idx; i++) {
    const s = order[i]!;
    if (s === "VIEWED" && target !== "VIEWED") {
      // skip optional viewed when seeding past it
      continue;
    }
    path.push(s);
  }
  return path;
}

export async function loadLatestShadowRun(
  client?: SqlClient,
): Promise<P186ShadowProjectionResult | null> {
  const db = client ?? (await createSqlClient());
  await applyP1861Migrations(db);
  const run = await db.query(
    `SELECT * FROM p186_shadow_runs ORDER BY projected_at DESC LIMIT 1`,
  );
  const row = run.rows[0];
  if (!row) return null;
  return {
    evaluated: Number(row.evaluated),
    matches: Number(row.matches),
    mismatches: Number(row.mismatches),
    duplicateTransitions: Number(row.duplicate_transitions),
    invalidTransitions: Number(row.invalid_transitions),
    missingTransitions: Number(row.missing_transitions),
    impossibleTransitions: Number(row.impossible_transitions),
    findings: [],
    projectedAt: new Date(String(row.projected_at)).toISOString(),
  };
}

/** Exported for tests — path builder. */
export function __testBuildPathTo(target: P186LifecycleState): P186LifecycleState[] {
  return buildPathTo(target);
}
