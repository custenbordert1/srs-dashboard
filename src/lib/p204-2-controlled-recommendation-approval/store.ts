import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type { P2041OperatorDecision } from "@/lib/p204-1-supervised-qualification-pilot/types";
import { recordP2041OperatorDecision } from "@/lib/p204-1-supervised-qualification-pilot/store";
import type { P2042OperatorDecisionRecord } from "@/lib/p204-2-controlled-recommendation-approval/types";

type DecisionStoreFile = {
  version: 1;
  updatedAt: string;
  cohortId: string;
  fingerprint: string;
  decisions: P2042OperatorDecisionRecord[];
  auditEvents: Array<{
    type: "p204_2_operator_decision";
    candidateId: string;
    redactedCandidateId: string;
    decision: string;
    outcomeStatus: string;
    at: string;
    by: string;
  }>;
};

function storePath(): string {
  return path.join(recruitingDataDir(), "p204-2-operator-decisions.json");
}

async function readStore(): Promise<DecisionStoreFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as DecisionStoreFile;
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      cohortId: parsed.cohortId ?? "",
      fingerprint: parsed.fingerprint ?? "",
      decisions: parsed.decisions ?? [],
      auditEvents: parsed.auditEvents ?? [],
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      cohortId: "",
      fingerprint: "",
      decisions: [],
      auditEvents: [],
    };
  }
}

async function writeStore(file: DecisionStoreFile): Promise<void> {
  await safeRecruitingMkdir(recruitingDataDir());
  await writeFile(storePath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

function mapToP2041Decision(
  decision: P2042OperatorDecisionRecord["decision"],
): Exclude<P2041OperatorDecision, null> {
  switch (decision) {
    case "agree_advance":
    case "agree_review":
    case "agree_reject":
      return "approve_recommendation";
    case "override_to_advance":
      return "override_to_advance";
    case "override_to_review":
      return "override_to_review";
    case "override_to_reject":
      return "override_to_reject";
    case "defer":
    case "stale_insufficient_evidence":
      return "defer";
  }
}

/** Idempotent upsert by candidateId + cohortId + decision + decidedAt fingerprint. */
export async function upsertP2042OperatorDecision(
  record: P2042OperatorDecisionRecord,
): Promise<{ record: P2042OperatorDecisionRecord; created: boolean }> {
  const file = await readStore();
  const idx = file.decisions.findIndex(
    (d) =>
      d.candidateId === record.candidateId &&
      d.cohortId === record.cohortId &&
      d.decision === record.decision &&
      d.operatorId === record.operatorId &&
      (d.overrideReason ?? null) === (record.overrideReason ?? null),
  );
  if (idx >= 0) {
    return { record: file.decisions[idx]!, created: false };
  }

  // Replace prior decision for same candidate+cohort (idempotent re-run keeps latest).
  const prior = file.decisions.find(
    (d) => d.candidateId === record.candidateId && d.cohortId === record.cohortId,
  );
  if (
    prior &&
    prior.decision === record.decision &&
    prior.operatorId === record.operatorId &&
    (prior.overrideReason ?? null) === (record.overrideReason ?? null) &&
    JSON.stringify(prior.evidenceChecklist) === JSON.stringify(record.evidenceChecklist)
  ) {
    return { record: prior, created: false };
  }

  file.decisions = [
    record,
    ...file.decisions.filter(
      (d) => !(d.candidateId === record.candidateId && d.cohortId === record.cohortId),
    ),
  ];
  file.cohortId = record.cohortId;
  file.fingerprint = record.fingerprint;
  file.updatedAt = new Date().toISOString();
  file.auditEvents.unshift({
    type: "p204_2_operator_decision",
    candidateId: record.candidateId,
    redactedCandidateId: record.redactedCandidateId,
    decision: record.decision,
    outcomeStatus: record.decidedOutcome,
    at: record.decidedAt,
    by: record.operatorId,
  });
  await writeStore(file);

  // Mirror minimal decision onto P204.1 recommendation store (decision fields only).
  await recordP2041OperatorDecision({
    candidateId: record.candidateId,
    cohortId: record.cohortId,
    decision: mapToP2041Decision(record.decision),
    byUserId: record.operatorId,
    notes: [
      `p204.2:${record.decision}`,
      record.overrideReason ? `override=${record.overrideReason}` : null,
      record.reviewNotes,
    ]
      .filter(Boolean)
      .join(" | "),
  });

  return { record, created: true };
}

export async function listP2042OperatorDecisions(): Promise<P2042OperatorDecisionRecord[]> {
  return (await readStore()).decisions;
}
