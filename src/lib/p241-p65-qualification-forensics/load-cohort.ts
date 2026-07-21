import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { p241RedactId } from "@/lib/p241-p65-qualification-forensics/redact";

export type P241BlockedSeed = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  appliedDate: string | null;
  assignedRecruiter: string;
  assignedDM: string;
  workflowStage: string;
  blocker: string;
  blockerDetail: string;
};

/**
 * Load the 8 P240 qualification_gate_failed candidates from artifacts
 * (preferred) or re-derive from an in-memory blocked list.
 */
export function loadP241QualificationFailedSeeds(cwd = process.cwd()): P241BlockedSeed[] {
  const artifactPath = path.join(cwd, "artifacts/p240-blocked-candidates.json");
  if (!existsSync(artifactPath)) {
    throw new Error(`P241: missing ${artifactPath}`);
  }
  const raw = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    rows?: Array<{
      candidateId?: string;
      redactedCandidateId?: string;
      displayName?: string;
      appliedDate?: string | null;
      assignedRecruiter?: string;
      assignedDM?: string;
      workflowStage?: string;
      blocker?: string;
      blockerDetail?: string;
    }>;
  };
  const rows = (raw.rows ?? [])
    .filter((r) => r.blocker === "qualification_gate_failed" && r.candidateId)
    .map((r) => ({
      candidateId: String(r.candidateId),
      redactedCandidateId: String(r.redactedCandidateId || p241RedactId(String(r.candidateId))),
      displayName: String(r.displayName || r.candidateId),
      appliedDate: r.appliedDate ?? null,
      assignedRecruiter: String(r.assignedRecruiter ?? "Unassigned"),
      assignedDM: String(r.assignedDM ?? "Unassigned"),
      workflowStage: String(r.workflowStage ?? "NO_WORKFLOW"),
      blocker: String(r.blocker),
      blockerDetail: String(r.blockerDetail ?? ""),
    }));

  if (rows.length !== 8) {
    throw new Error(
      `P241: expected exactly 8 qualification_gate_failed candidates from P240, found ${rows.length}`,
    );
  }
  return rows;
}

export function filterP241QualificationFailedFromTraces(
  traces: Array<{
    candidateId: string;
    redactedCandidateId?: string;
    displayName?: string;
    appliedDate?: string | null;
    assignedRecruiterSimulated?: string | null;
    assignedRecruiterBefore?: string;
    assignedDMSimulated?: string | null;
    assignedDMBefore?: string;
    currentStage?: string;
    blocker?: string | null;
    blockerDetail?: string | null;
  }>,
): P241BlockedSeed[] {
  return traces
    .filter((t) => t.blocker === "qualification_gate_failed")
    .map((t) => ({
      candidateId: t.candidateId,
      redactedCandidateId: t.redactedCandidateId || p241RedactId(t.candidateId),
      displayName: t.displayName || t.candidateId,
      appliedDate: t.appliedDate ?? null,
      assignedRecruiter: String(
        t.assignedRecruiterSimulated ?? t.assignedRecruiterBefore ?? "Unassigned",
      ),
      assignedDM: String(t.assignedDMSimulated ?? t.assignedDMBefore ?? "Unassigned"),
      workflowStage: String(t.currentStage ?? "NO_WORKFLOW"),
      blocker: "qualification_gate_failed",
      blockerDetail: String(t.blockerDetail ?? ""),
    }));
}

export function resolveP241CandidateContext(input: {
  seed: P241BlockedSeed;
  candidatesById: Map<string, BreezyCandidate>;
  workflows: Record<string, CandidateWorkflowRecord>;
}): {
  candidate: BreezyCandidate | undefined;
  workflow: CandidateWorkflowRecord | undefined;
} {
  return {
    candidate: input.candidatesById.get(input.seed.candidateId),
    workflow: input.workflows[input.seed.candidateId],
  };
}
