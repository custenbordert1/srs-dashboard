import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type { HistoricalNamedAssignment } from "@/lib/p188-3-recruiter-ownership-recovery/historicalScan";
import type {
  P1883RecoveryBucket,
  P1883RecoverySimulationRow,
} from "@/lib/p188-3-recruiter-ownership-recovery/types";

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Simulate recruiter recovery buckets without writing production data.
 *
 * Policy (no guessing):
 * - Last named audit assignment → operator_confirmation_required (auto source is reconstructable but not silently authoritative)
 * - Manual audit assignment → automatically_recoverable
 * - Conflict audit vs P158 sim → conflicting
 * - Only stale evidence → stale
 * - No evidence → impossible_to_recover
 */
export function simulateRecruiterRecovery(input: {
  workflows: CandidateWorkflowRecord[];
  lastNamedByCandidate: Record<string, HistoricalNamedAssignment>;
  p158Events: P158AssignmentAuditEvent[];
  jobResolvedByCandidate: Record<string, boolean>;
  nowMs?: number;
}): {
  rows: P1883RecoverySimulationRow[];
  counts: Record<P1883RecoveryBucket, number>;
} {
  const nowMs = input.nowMs ?? Date.now();
  const simLatest: Record<string, { recruiter: string; at: string }> = {};
  for (const e of input.p158Events) {
    if (e.executionMode !== "simulation") continue;
    const recruiter = (e.afterRecruiter ?? e.recruiter ?? "").trim();
    if (!recruiter || recruiter === "Unassigned") continue;
    const prev = simLatest[e.candidateId];
    if (prev && prev.at >= e.at) continue;
    simLatest[e.candidateId] = { recruiter, at: e.at };
  }

  const counts: Record<P1883RecoveryBucket, number> = {
    automatically_recoverable: 0,
    operator_confirmation_required: 0,
    impossible_to_recover: 0,
    conflicting: 0,
    stale: 0,
  };

  const rows: P1883RecoverySimulationRow[] = [];

  for (const wf of input.workflows) {
    const id = wf.candidateId;
    const named = input.lastNamedByCandidate[id];
    const sim = simLatest[id];
    const jobResolved = Boolean(input.jobResolvedByCandidate[id]);

    if (named && sim && named.recruiter !== sim.recruiter) {
      const row: P1883RecoverySimulationRow = {
        candidateId: id,
        bucket: "conflicting",
        proposedRecruiter: null,
        evidenceSource: `audit:${named.action}|p158_sim`,
        evidenceAt: named.at,
        detail: `Conflict ${named.recruiter} (audit) vs ${sim.recruiter} (P158 sim)`,
        jobResolved,
      };
      rows.push(row);
      counts.conflicting += 1;
      continue;
    }

    if (named) {
      const age = nowMs - Date.parse(named.at);
      const stale = Number.isFinite(age) && age > STALE_MS;
      if (stale) {
        rows.push({
          candidateId: id,
          bucket: "stale",
          proposedRecruiter: named.recruiter,
          evidenceSource: `audit:${named.action}`,
          evidenceAt: named.at,
          detail: "Historical named assignment is stale — operator confirmation required",
          jobResolved,
        });
        counts.stale += 1;
        continue;
      }

      const manual =
        named.action === "assign_recruiter" || named.action === "manual_assign_recruiter";
      if (manual) {
        rows.push({
          candidateId: id,
          bucket: "automatically_recoverable",
          proposedRecruiter: named.recruiter,
          evidenceSource: `audit:${named.action}`,
          evidenceAt: named.at,
          detail: "Last manual assignment can be restored after durability fix (simulation only)",
          jobResolved,
        });
        counts.automatically_recoverable += 1;
      } else {
        rows.push({
          candidateId: id,
          bucket: "operator_confirmation_required",
          proposedRecruiter: named.recruiter,
          evidenceSource: `audit:${named.action}`,
          evidenceAt: named.at,
          detail:
            "Last auto_assign_recruiter exists in audit but was wiped from durable store — confirm before restore",
          jobResolved,
        });
        counts.operator_confirmation_required += 1;
      }
      continue;
    }

    if (sim) {
      const age = nowMs - Date.parse(sim.at);
      if (Number.isFinite(age) && age > STALE_MS) {
        rows.push({
          candidateId: id,
          bucket: "stale",
          proposedRecruiter: sim.recruiter,
          evidenceSource: "p158_simulation",
          evidenceAt: sim.at,
          detail: "Stale P158 simulation only — not authoritative",
          jobResolved,
        });
        counts.stale += 1;
      } else {
        rows.push({
          candidateId: id,
          bucket: "operator_confirmation_required",
          proposedRecruiter: sim.recruiter,
          evidenceSource: "p158_simulation",
          evidenceAt: sim.at,
          detail: "P158 simulation only — never production-executed; operator must confirm",
          jobResolved,
        });
        counts.operator_confirmation_required += 1;
      }
      continue;
    }

    rows.push({
      candidateId: id,
      bucket: "impossible_to_recover",
      proposedRecruiter: null,
      evidenceSource: null,
      evidenceAt: null,
      detail: "No historical named assignment, manual assign, or usable simulation evidence",
      jobResolved,
    });
    counts.impossible_to_recover += 1;
  }

  return { rows, counts };
}
