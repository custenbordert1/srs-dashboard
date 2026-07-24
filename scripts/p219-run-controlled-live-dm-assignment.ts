/**
 * P219 — Controlled Live DM Assignment (2-Candidate Validation)
 *
 * Required invocation (exactly these flags):
 *   node --import tsx scripts/p219-run-controlled-live-dm-assignment.ts \
 *     --live --operator-approved --approved-by="Taylor Custenborder"
 *
 * Persists ONLY assignedDM for the two P216/P218-validated candidates.
 * No paperwork. No Dropbox Sign. No MEL/Breezy writes. No stage transitions.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assignCandidateDmIfUnassigned,
  getCandidateWorkflowState,
} from "@/lib/candidate-workflow-store";
import { evaluateP214Gates } from "@/lib/p214-unsent-test-batch/eligibility";
import { authorizeP218Mode } from "@/lib/p218-automatic-dm-assignment/authorization";
import {
  P219_APPROVED_BY,
  P219_MAX_CANDIDATES,
  P219_PHASE,
  P219_TARGETS,
  type P219PreviewDecision,
  type P219WorkflowSnapshot,
} from "@/lib/p219-controlled-live-dm-assignment";
import {
  assertP219WriteBudget,
  diffP219GlobalStore,
  verifyP219PostWrite,
  verifyP219PreWrite,
  verifyP219TargetAgainstPreview,
} from "@/lib/p219-controlled-live-dm-assignment/verify";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const value = line.trim();
      if (!value || value.startsWith("#")) continue;
      const equals = value.indexOf("=");
      if (equals < 0) continue;
      const key = value.slice(0, equals).trim();
      let content = value.slice(equals + 1).trim();
      if (
        (content.startsWith('"') && content.endsWith('"')) ||
        (content.startsWith("'") && content.endsWith("'"))
      ) {
        content = content.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = content;
    }
  } catch {
    // optional
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeArtifact(name: string, value: unknown): void {
  mkdirSync("artifacts", { recursive: true });
  const target = path.join("artifacts", name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
  console.log(`[artifact] ${target}`);
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function cloneWorkflows(
  workflows: Record<string, unknown>,
): Record<string, P219WorkflowSnapshot> {
  return JSON.parse(JSON.stringify(workflows)) as Record<string, P219WorkflowSnapshot>;
}

function abort(message: string, failures: string[] = []): never {
  console.error(`[P219 ABORT] ${message}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const authorization = authorizeP218Mode(argv);

  if (authorization.mode !== "live") {
    abort("P219 requires --live. Preview is not a valid execution mode for this phase.");
  }
  if (!authorization.approved) {
    abort("P219 live mode is not authorized.", authorization.failures);
  }
  if ((authorization.approvedBy ?? "").trim() !== P219_APPROVED_BY) {
    abort(
      `approved-by must be exactly "${P219_APPROVED_BY}"`,
      [`got: ${authorization.approvedBy ?? "null"}`],
    );
  }

  assertP219WriteBudget(P219_TARGETS.length);

  const p218Local = readJson<{
    mode: string;
    decisions: P219PreviewDecision[];
  }>(".data/p218-dm-assignment-operator-local.json");
  if (p218Local.mode !== "preview") {
    abort(`P218 operator ledger mode is "${p218Local.mode}", expected preview`);
  }

  const previewById = new Map(
    (p218Local.decisions ?? []).map((decision) => [decision.candidateId, decision]),
  );

  console.log("[P219] Part 1 — verify targets match P218 preview");
  const selection: Array<{
    target: (typeof P219_TARGETS)[number];
    preview: P219PreviewDecision;
  }> = [];
  for (const target of P219_TARGETS) {
    const preview = previewById.get(target.candidateId);
    const check = verifyP219TargetAgainstPreview(target, preview);
    if (!check.ok || !preview) {
      abort(`Target ${target.candidateId} does not match P218 preview.`, check.failures);
    }
    selection.push({ target, preview });
    console.log(
      `  ✓ ${target.redactedCandidateId} ${target.expectedCity}, ${target.expectedState} → ${target.expectedDm}`,
    );
  }

  console.log("[P219] Snapshotting workflow store (before)");
  const beforeState = await getCandidateWorkflowState();
  const beforeSnapshot = cloneWorkflows(beforeState as Record<string, unknown>);

  console.log("[P219] Part 2 — pre-write safety verification");
  for (const { target } of selection) {
    const record = beforeSnapshot[target.candidateId];
    const check = verifyP219PreWrite(target, record);
    if (!check.ok) {
      abort(`Pre-write safety failed for ${target.candidateId}.`, check.failures);
    }
    console.log(`  ✓ ${target.redactedCandidateId} Unassigned + active`);
  }

  console.log("[P219] Part 3 — live assignedDM persistence (exactly 2)");
  const writeResults: Array<{
    redactedCandidateId: string;
    candidateId: string;
    assigned: boolean;
    reason: string;
    expectedDm: string;
  }> = [];

  for (const { target, preview } of selection) {
    const result = await assignCandidateDmIfUnassigned({
      candidateId: target.candidateId,
      expectedDm: target.expectedDm,
      approvedBy: P219_APPROVED_BY,
      positionId: target.expectedPositionId,
      territory: preview.positionLocation?.state ?? target.expectedState,
    });
    writeResults.push({
      redactedCandidateId: target.redactedCandidateId,
      candidateId: target.candidateId,
      assigned: result.assigned,
      reason: result.reason,
      expectedDm: target.expectedDm,
    });
    if (!result.assigned) {
      abort(`Live write failed for ${target.candidateId}: ${result.reason}`);
    }
    console.log(`  ✓ wrote assignedDM=${target.expectedDm} for ${target.redactedCandidateId}`);
  }

  console.log("[P219] Part 4 — read-back verification");
  const afterState = await getCandidateWorkflowState();
  const afterSnapshot = cloneWorkflows(afterState as Record<string, unknown>);

  const verificationRows = [];
  for (const { target } of selection) {
    const before = beforeSnapshot[target.candidateId]!;
    const after = afterSnapshot[target.candidateId]!;
    const check = verifyP219PostWrite({ target, before, after });
    if (!check.ok) {
      abort(`Post-write verification failed for ${target.candidateId}.`, check.failures);
    }
    verificationRows.push({
      redactedCandidateId: target.redactedCandidateId,
      expectedDm: target.expectedDm,
      assignedDmAfter: after.assignedDM,
      workflowStatusBefore: before.workflowStatus,
      workflowStatusAfter: after.workflowStatus,
      paperworkStatusBefore: before.paperworkStatus ?? null,
      paperworkStatusAfter: after.paperworkStatus ?? null,
      assignedRecruiterBefore: before.assignedRecruiter ?? null,
      assignedRecruiterAfter: after.assignedRecruiter ?? null,
      changedFields: check.changedFields.map((c) => c.field),
      ok: true,
    });
    console.log(
      `  ✓ ${target.redactedCandidateId} assignedDM=${after.assignedDM}; changed=[${check.changedFields.map((c) => c.field).join(", ")}]`,
    );
  }

  console.log("[P219] Part 5 — P214 eligibility preview (no freeze, no send)");
  const p216 = readJson<{
    candidates: Array<{
      redactedCandidateId: string;
      position: string;
      positionId: string;
      positionLocation: { city: string; state: string; source: string } | null;
      nearestWork: string | null;
      distanceMiles: number | null;
      coverageTier: string;
      blockers: string[];
      expectedDm: string;
    }>;
  }>("artifacts/p216-candidate-comparison.json");

  const eligibilityPreview = p216.candidates.map((candidate) => {
    const target = P219_TARGETS.find((t) => t.redactedCandidateId === candidate.redactedCandidateId);
    if (!target) {
      return {
        redactedCandidateId: candidate.redactedCandidateId,
        outOfScope: true,
      };
    }
    const after = afterSnapshot[target.candidateId]!;
    const gates = evaluateP214Gates({
      nearestActiveWorkMiles: candidate.distanceMiles,
      hasActiveOpportunities: candidate.distanceMiles != null,
      coverageKnown: candidate.distanceMiles != null,
      assignedDm: String(after.assignedDM ?? ""),
      expectedDm: target.expectedDm,
      jobCity: candidate.positionLocation?.city ?? "",
      jobState: candidate.positionLocation?.state ?? "",
    });
    return {
      redactedCandidateId: candidate.redactedCandidateId,
      position: candidate.position,
      positionLocation: candidate.positionLocation,
      nearestWork: candidate.nearestWork,
      distanceMiles: candidate.distanceMiles,
      coverageTier: candidate.coverageTier,
      assignedDm: after.assignedDM,
      expectedDm: target.expectedDm,
      blockersBefore: candidate.blockers,
      blockersAfter: gates.blockers,
      eligible: gates.eligible,
      remainingBlockers: gates.blockers,
      wouldPassEveryGate: gates.eligible,
    };
  });

  console.log("[P219] Part 6 — global safety audit");
  const globalDiff = diffP219GlobalStore({
    before: beforeSnapshot,
    after: afterSnapshot,
    targetIds: P219_TARGETS.map((t) => t.candidateId),
  });
  if (globalDiff.targetIdsChanged.length !== P219_MAX_CANDIDATES) {
    abort("Global audit: target write count is not exactly 2.", [
      `changed=${globalDiff.targetIdsChanged.map((id) => sha256(id).slice(0, 12)).join(",")}`,
    ]);
  }
  if (
    globalDiff.nonTargetIdsChanged.length > 0 ||
    globalDiff.recordsAdded.length > 0 ||
    globalDiff.recordsRemoved.length > 0
  ) {
    abort("Global audit: non-target workflow mutations detected.", [
      `nonTarget=${globalDiff.nonTargetIdsChanged.length}`,
      `added=${globalDiff.recordsAdded.length}`,
      `removed=${globalDiff.recordsRemoved.length}`,
    ]);
  }
  console.log("  ✓ exactly 2 target records changed; 0 non-target changes");

  const generatedAt = new Date().toISOString();
  const safety = {
    candidatesWritten: writeResults.filter((r) => r.assigned).length,
    otherCandidatesWritten: globalDiff.nonTargetIdsChanged.length,
    workflowChangesOutsideTarget: globalDiff.nonTargetIdsChanged.length,
    dropboxRequests: 0,
    paperworkNeededTransitions: 0,
    paperworkSent: 0,
    melWrites: 0,
    breezyWrites: 0,
    workflowStageChanges: 0,
    cohortFrozen: false,
    envelopesCreated: 0,
  };

  const verificationArtifact = {
    phase: P219_PHASE,
    generatedAt,
    approvedBy: P219_APPROVED_BY,
    mode: "live",
    selection: selection.map(({ target, preview }) => ({
      redactedCandidateId: target.redactedCandidateId,
      expectedCity: target.expectedCity,
      expectedState: target.expectedState,
      expectedDm: target.expectedDm,
      expectedPositionId: target.expectedPositionId,
      previewMatched: true,
      previewAction: preview.action,
      previewPositionLocation: preview.positionLocation,
    })),
    writes: writeResults.map((row) => ({
      redactedCandidateId: row.redactedCandidateId,
      assigned: row.assigned,
      reason: row.reason,
      expectedDm: row.expectedDm,
    })),
    readBack: verificationRows,
    globalDiff: {
      targetRecordsChanged: globalDiff.targetIdsChanged.length,
      nonTargetRecordsChanged: globalDiff.nonTargetIdsChanged.length,
      recordsAdded: globalDiff.recordsAdded.length,
      recordsRemoved: globalDiff.recordsRemoved.length,
    },
    safety,
  };

  const eligibilityArtifact = {
    phase: P219_PHASE,
    generatedAt,
    previewOnly: true,
    freeze: false,
    send: false,
    candidates: eligibilityPreview,
    summary: {
      candidates: eligibilityPreview.length,
      wouldPassEveryGate: eligibilityPreview.filter(
        (row) => "wouldPassEveryGate" in row && row.wouldPassEveryGate,
      ).length,
      stillBlocked: eligibilityPreview.filter(
        (row) => "wouldPassEveryGate" in row && !row.wouldPassEveryGate,
      ).length,
    },
  };

  const report = [
    `# P219 — Controlled Live DM Assignment Report`,
    ``,
    `Generated: ${generatedAt}`,
    `Approved by: ${P219_APPROVED_BY}`,
    `Mode: live (assignedDM only)`,
    ``,
    `## Selection`,
    ``,
    `| Candidate | Location | Expected DM | Preview Match |`,
    `| --- | --- | --- | --- |`,
    ...selection.map(
      ({ target }) =>
        `| \`${target.redactedCandidateId}\` | ${target.expectedCity}, ${target.expectedState} | ${target.expectedDm} | YES |`,
    ),
    ``,
    `## Writes`,
    ``,
    `- Candidates written: **${safety.candidatesWritten}**`,
    `- Other candidates written: **${safety.otherCandidatesWritten}**`,
    `- Workflow changes outside target: **${safety.workflowChangesOutsideTarget}**`,
    ``,
    `| Candidate | assignedDM | Stage unchanged | Paperwork unchanged | Recruiter unchanged |`,
    `| --- | --- | --- | --- | --- |`,
    ...verificationRows.map(
      (row) =>
        `| \`${row.redactedCandidateId}\` | ${row.assignedDmAfter} | ${
          row.workflowStatusBefore === row.workflowStatusAfter ? "YES" : "NO"
        } | ${
          row.paperworkStatusBefore === row.paperworkStatusAfter ? "YES" : "NO"
        } | ${
          row.assignedRecruiterBefore === row.assignedRecruiterAfter ? "YES" : "NO"
        } |`,
    ),
    ``,
    `## Eligibility preview (P214 gates, no freeze/send)`,
    ``,
    ...eligibilityPreview
      .filter((row) => "wouldPassEveryGate" in row)
      .map(
        (row) =>
          `- \`${row.redactedCandidateId}\`: ${
            row.wouldPassEveryGate ? "WOULD PASS EVERY GATE" : `still blocked: ${(row.remainingBlockers ?? []).join(", ")}`
          } (assignedDM=${row.assignedDm})`,
      ),
    ``,
    `## Global safety`,
    ``,
    `- Dropbox requests: ${safety.dropboxRequests}`,
    `- Paperwork Needed transitions: ${safety.paperworkNeededTransitions}`,
    `- Paperwork sent: ${safety.paperworkSent}`,
    `- MEL writes: ${safety.melWrites}`,
    `- Breezy writes: ${safety.breezyWrites}`,
    `- Workflow stage changes: ${safety.workflowStageChanges}`,
    `- Cohort frozen: ${safety.cohortFrozen}`,
    ``,
    `## Confirmation`,
    ``,
    `Exactly 2 candidates updated. No other workflow changes. No paperwork sent. No Dropbox Sign requests. No MEL writes. No Breezy writes.`,
    ``,
  ].join("\n");

  writeArtifact("p219-verification.json", verificationArtifact);
  writeArtifact("p219-eligibility-preview.json", eligibilityArtifact);
  writeArtifact("p219-live-assignment-report.md", report);

  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/p219-controlled-live-dm-assignment-operator-local.json",
    `${JSON.stringify(
      {
        generatedAt,
        approvedBy: P219_APPROVED_BY,
        candidateIds: P219_TARGETS.map((t) => t.candidateId),
        writes: writeResults,
        verificationRows,
        globalDiff,
        safety,
      },
      null,
      2,
    )}\n`,
  );

  console.log("[P219] Complete — verification only. No paperwork. No Dropbox. Stop.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
