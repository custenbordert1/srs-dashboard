import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { P253MissionResult } from "@/lib/p253-controlled-live-paperwork-send/types";
import {
  buildP254CandidateForensic,
  buildP254ComboRecoverableImpact,
  buildP254FailureGroups,
  buildP254RecoverableImpact,
  buildP254Totals,
} from "@/lib/p254-eligibility-forensics/classify";
import { formatP254EligibilityForensicsMarkdown } from "@/lib/p254-eligibility-forensics/format";
import {
  P254_OPS_DATE,
  P254_PHASE,
  P254_SOURCE_ARTIFACT,
  type P254MissionResult,
} from "@/lib/p254-eligibility-forensics/types";

function writeArtifact(artifactsDir: string, name: string, value: unknown): string {
  mkdirSync(artifactsDir, { recursive: true });
  const target = path.join(artifactsDir, name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  return target;
}

function loadP253Artifact(cwd: string, relativePath: string): P253MissionResult {
  const full = path.join(cwd, relativePath);
  if (!existsSync(full)) {
    throw new Error(`P254: missing source artifact ${relativePath}`);
  }
  return JSON.parse(readFileSync(full, "utf8")) as P253MissionResult;
}

/**
 * P254 — read-only forensic analysis of P253 eligibility exclusions.
 * Writes audit artifacts only. Never sends paperwork or mutates durable stores.
 */
export async function runP254EligibilityForensics(input?: {
  cwd?: string;
  sourceArtifact?: string;
  artifactsDir?: string;
  /** When false, skip durable enrichment (artifact-only). Default true. */
  enrichFromDurable?: boolean;
}): Promise<P254MissionResult> {
  const cwd = input?.cwd ?? process.cwd();
  const sourceArtifact = input?.sourceArtifact ?? P254_SOURCE_ARTIFACT;
  const artifactsDir = input?.artifactsDir ?? path.join(cwd, "artifacts");
  const generatedAt = new Date().toISOString();

  const p253 = loadP253Artifact(cwd, sourceArtifact);
  const rows = p253.candidates ?? [];

  let breezyById = new Map<string, string>();
  let durableWorkflowRead = false;
  let durableIngestionRead = false;
  const durablePaths: string[] = [];

  if (input?.enrichFromDurable !== false) {
    try {
      await getCandidateWorkflowState();
      durableWorkflowRead = true;
      durablePaths.push(".data/candidate-workflows.json");
    } catch {
      durableWorkflowRead = false;
    }

    try {
      const store = await readIngestionStore();
      durableIngestionRead = true;
      durablePaths.push(".data/candidate-ingestion.json");
      for (const c of listIngestedCandidates(store)) {
        const stage = String(c.stage ?? "").trim();
        if (stage) breezyById.set(c.candidateId, stage);
      }
    } catch {
      durableIngestionRead = false;
      breezyById = new Map();
    }
  }

  const candidates = rows.map((row) =>
    buildP254CandidateForensic({
      row,
      breezyStage: breezyById.get(row.candidateId) ?? null,
    }),
  );

  candidates.sort((a, b) => {
    if (a.failureGroup !== b.failureGroup) {
      return a.failureGroup.localeCompare(b.failureGroup);
    }
    return a.name.localeCompare(b.name);
  });

  const totals = buildP254Totals(candidates);
  const failureGroups = buildP254FailureGroups(candidates);
  const recoverableImpact = buildP254RecoverableImpact(rows);
  const comboImpact = buildP254ComboRecoverableImpact(rows);

  const result: P254MissionResult = {
    phase: P254_PHASE,
    opsDate: P254_OPS_DATE,
    generatedAt,
    mode: "read_only_forensics",
    sourceArtifact,
    sourceGeneratedAt: p253.generatedAt ?? null,
    p253Mode: p253.mode ?? null,
    p253AbortReason: p253.abortReason ?? null,
    totals,
    failureGroups,
    recoverableImpact,
    candidates,
    enrichment: {
      durableWorkflowRead,
      durableIngestionRead,
      breezyStagesResolved: candidates.filter((c) => Boolean(c.breezyStage)).length,
      durablePaths,
    },
    safety: {
      paperworkSends: 0,
      workflowWrites: 0,
      dropboxWrites: 0,
      breezyWrites: 0,
      melWrites: 0,
    },
    artifacts: [],
  };

  const jsonRel = path.join("artifacts", "p254-eligibility-forensics.json");
  const mdRel = path.join("artifacts", "p254-eligibility-forensics.md");
  const groupsRel = path.join("artifacts", "p254-failure-groups.json");

  const failureGroupsPayload = {
    phase: P254_PHASE,
    generatedAt,
    opsDate: P254_OPS_DATE,
    sourceArtifact,
    totals,
    failureGroups,
    recoverableImpact,
    comboRecoverableImpact: comboImpact,
    safety: result.safety,
  };

  writeArtifact(artifactsDir, "p254-eligibility-forensics.json", result);
  writeArtifact(
    artifactsDir,
    "p254-eligibility-forensics.md",
    formatP254EligibilityForensicsMarkdown(result, rows),
  );
  writeArtifact(artifactsDir, "p254-failure-groups.json", failureGroupsPayload);

  result.artifacts = [jsonRel, mdRel, groupsRel];
  // Re-write JSON with artifact list populated.
  writeArtifact(artifactsDir, "p254-eligibility-forensics.json", result);

  return result;
}
