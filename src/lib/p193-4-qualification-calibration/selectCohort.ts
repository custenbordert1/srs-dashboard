import { createHash, randomUUID } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { evaluatePilotEligibility } from "@/lib/p193-2-simplified-lifecycle-pilot/selectCohort";
import { evaluateP1934Calibration } from "@/lib/p193-4-qualification-calibration/calibratedScorer";
import { isWithdrawnOrHeld } from "@/lib/p193-4-qualification-calibration/rootCause";
import type {
  P1934FrozenCohort,
  P1934PilotMember,
} from "@/lib/p193-4-qualification-calibration/types";
import {
  P193_4_AUTH_EXPIRATION_HOURS,
  P193_4_MAPPING_VERSION,
  P193_4_MAX_COHORT,
  P193_4_SCHEMA_VERSION,
  P193_4_SCORE_MODEL_VERSION,
  P193_4_THRESHOLD_VERSION,
} from "@/lib/p193-4-qualification-calibration/types";
import type { P1933QuestionnaireRecord } from "@/lib/p193-3-questionnaire-capture/types";

function hash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export function cohortFingerprint(memberIds: string[]): string {
  return createHash("sha256")
    .update(
      [...memberIds].sort().join("|") +
        `|${P193_4_SCORE_MODEL_VERSION}|${P193_4_THRESHOLD_VERSION}`,
    )
    .digest("hex")
    .slice(0, 24);
}

export function selectP1934PilotCohort(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  recordsById: Record<string, P1933QuestionnaireRecord>;
  ingestionUpdatedAt?: string | null;
  questionnaireStoreUpdatedAt?: string | null;
  maxSize?: number;
  nowMs?: number;
}): {
  cohort: P1934FrozenCohort;
  scored: Array<{
    candidateId: string;
    decision: string;
    confidence: number;
    hardGates: string[];
  }>;
  counts: {
    Qualified: number;
    "Needs Human Review": number;
    "Request More Information": number;
  };
} {
  const nowMs = input.nowMs ?? Date.now();
  const maxSize = Math.min(input.maxSize ?? P193_4_MAX_COHORT, P193_4_MAX_COHORT);
  const emailSeen = new Set<string>();
  const jobCounts = new Map<string, number>();
  const stateCounts = new Map<string, number>();
  const scoredAll: Array<{
    candidate: BreezyCandidate;
    decision: ReturnType<typeof evaluateP1934Calibration>["decision"];
    confidence: number;
    hardGates: string[];
  }> = [];

  for (const candidate of input.candidates) {
    const workflow = input.workflows[candidate.candidateId];
    const eligibility = evaluatePilotEligibility({ candidate, workflow });
    if (!eligibility.ok) continue;
    if (isWithdrawnOrHeld(workflow)) continue;

    const record = input.recordsById[candidate.candidateId];
    const score = evaluateP1934Calibration({
      candidate,
      mappedFields: record?.mappedQualificationFields,
      workflowStatus: workflow?.workflowStatus,
      withdrawnOrHeld: false,
      nearbyJob: {
        city: candidate.city ?? undefined,
        state: candidate.state ?? undefined,
        zip: candidate.zipCode ?? undefined,
      },
    });
    scoredAll.push({
      candidate,
      decision: score.decision,
      confidence: score.confidence,
      hardGates: score.hardGates,
    });
  }

  // Prefer Qualified, then high-confidence NHR for review package diversity, freeze up to 10
  const qualified = scoredAll
    .filter((s) => s.decision === "Qualified")
    .sort((a, b) => b.confidence - a.confidence);
  const review = scoredAll
    .filter((s) => s.decision !== "Qualified")
    .sort((a, b) => b.confidence - a.confidence);

  const selected: typeof scoredAll = [];
  for (const pool of [qualified, review]) {
    for (const row of pool) {
      if (selected.length >= maxSize) break;
      const email = (row.candidate.email ?? "").trim().toLowerCase();
      if (emailSeen.has(email)) continue;
      const jobKey = row.candidate.positionId ?? "unknown";
      const stateKey = (row.candidate.state ?? "??").toUpperCase();
      if ((jobCounts.get(jobKey) ?? 0) >= 2) continue;
      if ((stateCounts.get(stateKey) ?? 0) >= 3) continue;
      emailSeen.add(email);
      jobCounts.set(jobKey, (jobCounts.get(jobKey) ?? 0) + 1);
      stateCounts.set(stateKey, (stateCounts.get(stateKey) ?? 0) + 1);
      selected.push(row);
    }
  }

  const members: P1934PilotMember[] = selected.map((row) => {
    const c = row.candidate;
    const wf = input.workflows[c.candidateId];
    return {
      candidateId: c.candidateId,
      positionId: c.positionId!,
      positionName: c.positionName ?? "",
      city: c.city ?? null,
      state: c.state ?? null,
      zipCode: c.zipCode ?? null,
      emailHash: hash(c.email ?? ""),
      phoneHash: hash(String(c.phone ?? "").replace(/\D/g, "")),
      decision: row.decision,
      confidence: row.confidence,
      legacyWorkflowStatus: wf?.workflowStatus ?? null,
    };
  });

  const counts = {
    Qualified: members.filter((m) => m.decision === "Qualified").length,
    "Needs Human Review": members.filter((m) => m.decision === "Needs Human Review").length,
    "Request More Information": members.filter((m) => m.decision === "Request More Information")
      .length,
  };

  const ids = members.map((m) => m.candidateId);
  const frozenAt = new Date(nowMs).toISOString();
  const cohort: P1934FrozenCohort = {
    schemaVersion: P193_4_SCHEMA_VERSION,
    pilotId: `p193-4-pilot-${randomUUID().slice(0, 10)}`,
    fingerprint: cohortFingerprint(ids),
    frozenAt,
    expiresAt: new Date(nowMs + P193_4_AUTH_EXPIRATION_HOURS * 3600_000).toISOString(),
    immutable: true,
    scoreModelVersion: P193_4_SCORE_MODEL_VERSION,
    thresholdVersion: P193_4_THRESHOLD_VERSION,
    mappingVersion: P193_4_MAPPING_VERSION,
    maxSize,
    members,
    sourceVersions: {
      ingestionUpdatedAt: input.ingestionUpdatedAt ?? null,
      questionnaireStoreUpdatedAt: input.questionnaireStoreUpdatedAt ?? null,
    },
  };

  return {
    cohort,
    scored: scoredAll.map((s) => ({
      candidateId: s.candidate.candidateId,
      decision: s.decision,
      confidence: s.confidence,
      hardGates: s.hardGates,
    })),
    counts,
  };
}
