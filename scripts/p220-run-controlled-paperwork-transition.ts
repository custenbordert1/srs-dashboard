/**
 * P220 — Controlled Paperwork Transition Validation (2-Candidate)
 *
 * Required invocation:
 *   node --import tsx scripts/p220-run-controlled-paperwork-transition.ts \
 *     --live --operator-approved --approved-by="Taylor Custenborder"
 *
 * Stage-only write to "Paperwork Needed" for the two P219 candidates.
 * No Dropbox Sign. No emails. No MEL/Breezy. No recruiter assignment.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  getCandidateWorkflowState,
  transitionCandidateToPaperworkNeeded,
} from "@/lib/candidate-workflow-store";
import {
  P220_APPROVED_BY,
  P220_MAX_CANDIDATES,
  P220_PHASE,
  P220_TARGET_STAGE,
  P220_TARGETS,
  type P220EligibilityEvidence,
  type P220WorkflowSnapshot,
  assertP220LiveAuthorized,
  assertP220NoSendPath,
  assertP220WriteBudget,
  authorizeP220Mode,
  diffP220GlobalStore,
  verifyP220PostWrite,
  verifyP220PreWrite,
} from "@/lib/p220-controlled-paperwork-transition";

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
): Record<string, P220WorkflowSnapshot> {
  return JSON.parse(JSON.stringify(workflows)) as Record<string, P220WorkflowSnapshot>;
}

function abort(message: string, failures: string[] = []): never {
  console.error(`[P220 ABORT] ${message}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

function loadEligibilityEvidence(): Map<string, P220EligibilityEvidence> {
  const p219 = readJson<{
    candidates: Array<{
      redactedCandidateId: string;
      distanceMiles: number | null;
      positionLocation: { city: string; state: string } | null;
    }>;
  }>("artifacts/p219-eligibility-preview.json");

  const byRedacted = new Map(
    (p219.candidates ?? []).map((row) => [row.redactedCandidateId, row]),
  );

  const map = new Map<string, P220EligibilityEvidence>();
  for (const target of P220_TARGETS) {
    const row = byRedacted.get(target.redactedCandidateId);
    if (!row) {
      abort(`Missing P219 eligibility evidence for ${target.redactedCandidateId}`);
    }
    map.set(target.candidateId, {
      nearestActiveWorkMiles: row.distanceMiles,
      hasActiveOpportunities: row.distanceMiles != null,
      coverageKnown: row.distanceMiles != null,
      jobCity: row.positionLocation?.city ?? target.expectedCity,
      jobState: row.positionLocation?.state ?? target.expectedState,
    });
  }
  return map;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const authorization = authorizeP220Mode(argv);
  assertP220LiveAuthorized(authorization);
  assertP220WriteBudget(P220_TARGETS.length);
  assertP220NoSendPath("p220_paperwork_needed_transition");

  const evidenceById = loadEligibilityEvidence();

  console.log("[P220] Part 1 — durable store read + P219 assignedDM verification");
  const beforeState = await getCandidateWorkflowState();
  const beforeSnapshot = cloneWorkflows(beforeState as Record<string, unknown>);

  for (const target of P220_TARGETS) {
    const record = beforeSnapshot[target.candidateId];
    const evidence = evidenceById.get(target.candidateId)!;
    const check = verifyP220PreWrite(target, record, evidence);
    if (!check.ok) {
      abort(`Pre-write safety failed for ${target.candidateId}.`, check.failures);
    }
    console.log(
      `  ✓ ${target.redactedCandidateId} assignedDM=${record!.assignedDM} stage=${record!.workflowStatus} eligible`,
    );
  }

  console.log("[P220] Part 2 — live stage-only transition to Paperwork Needed (exactly 2)");
  const writeResults: Array<{
    redactedCandidateId: string;
    candidateId: string;
    transitioned: boolean;
    reason: string;
    previousStage: string | null;
    newStage: string | null;
  }> = [];

  for (const target of P220_TARGETS) {
    const result = await transitionCandidateToPaperworkNeeded({
      candidateId: target.candidateId,
      expectedDm: target.expectedDm,
      approvedBy: P220_APPROVED_BY,
    });
    writeResults.push({
      redactedCandidateId: target.redactedCandidateId,
      candidateId: target.candidateId,
      transitioned: result.transitioned,
      reason: result.reason,
      previousStage: result.previousStage,
      newStage: result.newStage,
    });
    if (!result.transitioned) {
      abort(`Live transition failed for ${target.candidateId}: ${result.reason}`);
    }
    console.log(
      `  ✓ ${target.redactedCandidateId} ${result.previousStage} → ${result.newStage} (${result.reason})`,
    );
  }

  console.log("[P220] Part 3 — read-back verification");
  const afterState = await getCandidateWorkflowState();
  const afterSnapshot = cloneWorkflows(afterState as Record<string, unknown>);

  const verificationRows = [];
  for (const target of P220_TARGETS) {
    const before = beforeSnapshot[target.candidateId]!;
    const after = afterSnapshot[target.candidateId]!;
    const check = verifyP220PostWrite({ target, before, after });
    if (!check.ok) {
      abort(`Post-write verification failed for ${target.candidateId}.`, check.failures);
    }
    verificationRows.push({
      redactedCandidateId: target.redactedCandidateId,
      previousStage: check.previousStage,
      newStage: check.newStage,
      assignedDm: after.assignedDM,
      assignedRecruiter: after.assignedRecruiter ?? null,
      paperworkStatus: after.paperworkStatus ?? null,
      signatureRequestId: after.signatureRequestId ?? null,
      changedFields: check.changedFields.map((c) => c.field),
      ok: true,
    });
    console.log(
      `  ✓ ${target.redactedCandidateId} ${check.previousStage} → ${check.newStage}; changed=[${check.changedFields.map((c) => c.field).join(", ")}]`,
    );
  }

  console.log("[P220] Part 4 — global durable store diff");
  const globalDiff = diffP220GlobalStore({
    before: beforeSnapshot,
    after: afterSnapshot,
    targetIds: P220_TARGETS.map((t) => t.candidateId),
  });
  if (globalDiff.targetIdsChanged.length !== P220_MAX_CANDIDATES) {
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
    candidatesWritten: writeResults.filter((r) => r.transitioned).length,
    otherCandidatesWritten: globalDiff.nonTargetIdsChanged.length,
    workflowChangesOutsideTarget: globalDiff.nonTargetIdsChanged.length,
    dropboxRequests: 0,
    signatureRequestsCreated: 0,
    paperworkSent: 0,
    emailsSent: 0,
    melWrites: 0,
    breezyWrites: 0,
    recruiterChanges: 0,
    notesChanges: 0,
    advancedBeyondPaperworkNeeded: 0,
  };

  const verificationArtifact = {
    phase: P220_PHASE,
    generatedAt,
    approvedBy: P220_APPROVED_BY,
    mode: "live",
    targetStage: P220_TARGET_STAGE,
    selection: P220_TARGETS.map((target) => ({
      redactedCandidateId: target.redactedCandidateId,
      expectedCity: target.expectedCity,
      expectedState: target.expectedState,
      expectedDm: target.expectedDm,
    })),
    writes: writeResults.map((row) => ({
      redactedCandidateId: row.redactedCandidateId,
      transitioned: row.transitioned,
      reason: row.reason,
      previousStage: row.previousStage,
      newStage: row.newStage,
    })),
    readBack: verificationRows,
    safety,
  };

  const globalDiffArtifact = {
    phase: P220_PHASE,
    generatedAt,
    targetRecordsChanged: globalDiff.targetIdsChanged.length,
    nonTargetRecordsChanged: globalDiff.nonTargetIdsChanged.length,
    recordsAdded: globalDiff.recordsAdded.length,
    recordsRemoved: globalDiff.recordsRemoved.length,
    targetRedactedIds: globalDiff.targetIdsChanged.map((id) => sha256(id).slice(0, 12)),
    nonTargetRedactedIds: globalDiff.nonTargetIdsChanged.map((id) =>
      sha256(id).slice(0, 12),
    ),
    safety,
  };

  const report = [
    `# P220 — Controlled Paperwork Transition Report`,
    ``,
    `Generated: ${generatedAt}`,
    `Approved by: ${P220_APPROVED_BY}`,
    `Mode: live (workflowStage → Paperwork Needed only)`,
    ``,
    `## Candidates processed`,
    ``,
    `| Candidate | Location | Expected DM | Previous stage | New stage | Reason |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...writeResults.map((row, index) => {
      const target = P220_TARGETS[index]!;
      return `| \`${row.redactedCandidateId}\` | ${target.expectedCity}, ${target.expectedState} | ${target.expectedDm} | ${row.previousStage} | ${row.newStage} | ${row.reason} |`;
    }),
    ``,
    `## Verification`,
    ``,
    ...verificationRows.map(
      (row) =>
        `- \`${row.redactedCandidateId}\`: ${row.previousStage} → ${row.newStage}; assignedDM=${row.assignedDm}; paperwork=${row.paperworkStatus}; changed=[${row.changedFields.join(", ")}]`,
    ),
    ``,
    `## Global diff`,
    ``,
    `- Target records changed: **${globalDiffArtifact.targetRecordsChanged}**`,
    `- Non-target records changed: **${globalDiffArtifact.nonTargetRecordsChanged}**`,
    `- Records added: **${globalDiffArtifact.recordsAdded}**`,
    `- Records removed: **${globalDiffArtifact.recordsRemoved}**`,
    ``,
    `## Safety confirmation`,
    ``,
    `- Dropbox requests: ${safety.dropboxRequests}`,
    `- Signature requests created: ${safety.signatureRequestsCreated}`,
    `- Paperwork sent: ${safety.paperworkSent}`,
    `- Emails sent: ${safety.emailsSent}`,
    `- MEL writes: ${safety.melWrites}`,
    `- Breezy writes: ${safety.breezyWrites}`,
    `- Recruiter changes: ${safety.recruiterChanges}`,
    `- Notes changes: ${safety.notesChanges}`,
    `- Advanced beyond Paperwork Needed: ${safety.advancedBeyondPaperworkNeeded}`,
    ``,
    `## Confirmation`,
    ``,
    `NO paperwork was sent. NO Dropbox Sign requests were created. Execution stopped immediately after the workflow transition.`,
    ``,
  ].join("\n");

  writeArtifact("p220-verification.json", verificationArtifact);
  writeArtifact("p220-global-diff.json", globalDiffArtifact);
  writeArtifact("p220-paperwork-transition-report.md", report);

  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/p220-controlled-paperwork-transition-operator-local.json",
    `${JSON.stringify(
      {
        generatedAt,
        approvedBy: P220_APPROVED_BY,
        candidateIds: P220_TARGETS.map((t) => t.candidateId),
        writes: writeResults,
        verificationRows,
        globalDiff,
        safety,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    "[P220] Complete — NO paperwork sent. Stopped immediately after workflow transition.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
