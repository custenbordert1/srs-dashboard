/**
 * P221 — Controlled Dropbox Sign Send Validation (2-Candidate)
 *
 * Required invocation:
 *   node --import tsx scripts/p221-run-controlled-dropbox-sign-send.ts \
 *     --live --operator-approved --approved-by="Taylor Custenborder"
 *
 * Creates exactly one Dropbox Sign request per P219/P220 candidate via
 * executeOnboardingSend. No MEL/Breezy/recruiter/notes writes. Stops after
 * Paperwork Sent.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { executeOnboardingSend } from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  P221_APPROVED_BY,
  P221_MAX_CANDIDATES,
  P221_PHASE,
  P221_TARGETS,
  type P221EligibilityEvidence,
  type P221WorkflowSnapshot,
  assertP221ExactlyTwoSignatureRequests,
  assertP221LiveAuthorized,
  assertP221NoExternalWrite,
  assertP221WriteBudget,
  authorizeP221Mode,
  diffP221GlobalStore,
  verifyP221PostWrite,
  verifyP221Preflight,
} from "@/lib/p221-controlled-dropbox-sign-send";

const MIN_SEND_INTERVAL_MS = 15_000;

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
): Record<string, P221WorkflowSnapshot> {
  return JSON.parse(JSON.stringify(workflows)) as Record<string, P221WorkflowSnapshot>;
}

function abort(message: string, failures: string[] = []): never {
  console.error(`[P221 ABORT] ${message}`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEligibilityEvidence(): Map<string, P221EligibilityEvidence> {
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

  const map = new Map<string, P221EligibilityEvidence>();
  for (const target of P221_TARGETS) {
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
  const authorization = authorizeP221Mode(argv);
  assertP221LiveAuthorized(authorization);
  assertP221WriteBudget(P221_TARGETS.length);
  assertP221NoExternalWrite("p221_dropbox_sign_send");

  const cfg = readDropboxSignConfig();
  if (!cfg) abort("Dropbox Sign is not configured (missing DROPBOX_SIGN_API_KEY)");
  console.log(`[P221] Dropbox Sign config: testMode=${cfg.testMode}`);

  const evidenceById = loadEligibilityEvidence();

  console.log("[P221] Preflight — durable store read only");
  const beforeState = await getCandidateWorkflowState();
  const beforeSnapshot = cloneWorkflows(beforeState as Record<string, unknown>);

  if (P221_TARGETS.length > P221_MAX_CANDIDATES) {
    abort("More than two candidates qualify — abort");
  }

  for (const target of P221_TARGETS) {
    const record = beforeSnapshot[target.candidateId];
    const evidence = evidenceById.get(target.candidateId)!;
    const check = verifyP221Preflight(target, record, evidence);
    if (!check.ok) {
      abort(`Preflight failed for ${target.candidateId}.`, check.failures);
    }
    console.log(
      `  ✓ ${target.redactedCandidateId} DM=${record!.assignedDM} stage=${record!.workflowStatus} paperwork=${record!.paperworkStatus} sig=null eligible`,
    );
  }

  console.log("[P221] Live send — exactly 2 Dropbox Sign requests via executeOnboardingSend");
  const sendResults: Array<{
    redactedCandidateId: string;
    candidateId: string;
    ok: boolean;
    signatureRequestId: string | null;
    paperworkStatus: string | null;
    error: string | null;
    testMode: boolean;
  }> = [];

  let lastSendAt = 0;
  for (const target of P221_TARGETS) {
    // Immediate re-check against live store before each send.
    const live = (await getCandidateWorkflowState())[target.candidateId];
    const evidence = evidenceById.get(target.candidateId)!;
    const recheck = verifyP221Preflight(
      target,
      live as P221WorkflowSnapshot | undefined,
      evidence,
    );
    if (!recheck.ok) {
      abort(`Immediate pre-send recheck failed for ${target.candidateId}.`, recheck.failures);
    }

    const wait = lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
    if (lastSendAt > 0 && wait > 0) {
      console.log(`  … rate limit wait ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
    }
    lastSendAt = Date.now();

    const result = await executeOnboardingSend({
      candidateId: target.candidateId,
      candidateName: target.expectedName,
      candidateEmail: target.expectedEmail,
      templateKey: "onboarding_packet",
      byUserId: P221_APPROVED_BY,
      recordWorkflowFailureOnError: false,
    });

    if (!result.ok) {
      sendResults.push({
        redactedCandidateId: target.redactedCandidateId,
        candidateId: target.candidateId,
        ok: false,
        signatureRequestId: null,
        paperworkStatus: null,
        error: result.error,
        testMode: cfg.testMode,
      });
      abort(`Send failed for ${target.candidateId}: ${result.error}`);
    }

    sendResults.push({
      redactedCandidateId: target.redactedCandidateId,
      candidateId: target.candidateId,
      ok: true,
      signatureRequestId: result.signatureRequestId,
      paperworkStatus: result.paperworkStatus,
      error: null,
      testMode: cfg.testMode,
    });
    console.log(
      `  ✓ ${target.redactedCandidateId} signatureRequestId=${result.signatureRequestId} paperwork=${result.paperworkStatus}`,
    );
  }

  console.log("[P221] Read-back verification");
  const afterState = await getCandidateWorkflowState();
  const afterSnapshot = cloneWorkflows(afterState as Record<string, unknown>);

  const verificationRows = [];
  for (const target of P221_TARGETS) {
    const before = beforeSnapshot[target.candidateId]!;
    const after = afterSnapshot[target.candidateId]!;
    const check = verifyP221PostWrite({ target, before, after });
    if (!check.ok) {
      abort(`Post-write verification failed for ${target.candidateId}.`, check.failures);
    }
    verificationRows.push({
      redactedCandidateId: target.redactedCandidateId,
      previousStage: check.previousStage,
      newStage: check.newStage,
      previousPaperworkStatus: check.previousPaperworkStatus,
      newPaperworkStatus: check.newPaperworkStatus,
      signatureRequestId: after.signatureRequestId ?? null,
      assignedDm: after.assignedDM,
      assignedRecruiter: after.assignedRecruiter ?? null,
      changedFields: check.changedFields.map((c) => c.field),
      ok: true,
    });
    console.log(
      `  ✓ ${target.redactedCandidateId} ${check.previousPaperworkStatus}→${check.newPaperworkStatus} stage ${check.previousStage}→${check.newStage}`,
    );
  }

  const signatureIds = verificationRows.map((row) => row.signatureRequestId);
  assertP221ExactlyTwoSignatureRequests(signatureIds);

  console.log("[P221] Global durable store diff");
  const globalDiff = diffP221GlobalStore({
    before: beforeSnapshot,
    after: afterSnapshot,
    targetIds: P221_TARGETS.map((t) => t.candidateId),
  });
  if (globalDiff.targetIdsChanged.length !== P221_MAX_CANDIDATES) {
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
    candidatesWritten: sendResults.filter((r) => r.ok).length,
    otherCandidatesWritten: globalDiff.nonTargetIdsChanged.length,
    workflowChangesOutsideTarget: globalDiff.nonTargetIdsChanged.length,
    dropboxSignRequestsCreated: signatureIds.filter(Boolean).length,
    melWrites: 0,
    breezyWrites: 0,
    recruiterChanges: 0,
    assignedDmChanges: 0,
    notesChanges: 0,
    reminderEmails: 0,
    reminderJobs: 0,
    advancedBeyondPaperworkSent: 0,
    testMode: cfg.testMode,
  };

  const signatureArtifact = {
    phase: P221_PHASE,
    generatedAt,
    approvedBy: P221_APPROVED_BY,
    testMode: cfg.testMode,
    requests: sendResults.map((row) => ({
      redactedCandidateId: row.redactedCandidateId,
      signatureRequestId: row.signatureRequestId,
      paperworkStatus: row.paperworkStatus,
      ok: row.ok,
      testMode: row.testMode,
    })),
    count: signatureIds.filter(Boolean).length,
  };

  const verificationArtifact = {
    phase: P221_PHASE,
    generatedAt,
    approvedBy: P221_APPROVED_BY,
    mode: "live",
    testMode: cfg.testMode,
    selection: P221_TARGETS.map((target) => ({
      redactedCandidateId: target.redactedCandidateId,
      expectedCity: target.expectedCity,
      expectedState: target.expectedState,
      expectedDm: target.expectedDm,
    })),
    sends: sendResults.map((row) => ({
      redactedCandidateId: row.redactedCandidateId,
      ok: row.ok,
      signatureRequestId: row.signatureRequestId,
      paperworkStatus: row.paperworkStatus,
      error: row.error,
    })),
    readBack: verificationRows,
    safety,
  };

  const globalDiffArtifact = {
    phase: P221_PHASE,
    generatedAt,
    targetRecordsChanged: globalDiff.targetIdsChanged.length,
    nonTargetRecordsChanged: globalDiff.nonTargetIdsChanged.length,
    recordsAdded: globalDiff.recordsAdded.length,
    recordsRemoved: globalDiff.recordsRemoved.length,
    targetRedactedIds: globalDiff.targetIdsChanged.map((id) => sha256(id).slice(0, 12)),
    nonTargetRedactedIds: globalDiff.nonTargetIdsChanged.map((id) =>
      sha256(id).slice(0, 12),
    ),
    dropboxSignRequestsCreated: safety.dropboxSignRequestsCreated,
    safety,
  };

  const report = [
    `# P221 — Controlled Dropbox Sign Send Report`,
    ``,
    `Generated: ${generatedAt}`,
    `Approved by: ${P221_APPROVED_BY}`,
    `Mode: live`,
    `Dropbox testMode: ${cfg.testMode}`,
    ``,
    `## Candidates processed`,
    ``,
    `| Candidate | Location | DM | Paperwork before | Paperwork after | Stage | Signature Request ID |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
    ...verificationRows.map((row, index) => {
      const target = P221_TARGETS[index]!;
      return `| \`${row.redactedCandidateId}\` | ${target.expectedCity}, ${target.expectedState} | ${row.assignedDm} | ${row.previousPaperworkStatus} | ${row.newPaperworkStatus} | ${row.previousStage} → ${row.newStage} | \`${row.signatureRequestId}\` |`;
    }),
    ``,
    `## Verification`,
    ``,
    ...verificationRows.map(
      (row) =>
        `- \`${row.redactedCandidateId}\`: sig=${row.signatureRequestId}; paperwork ${row.previousPaperworkStatus}→${row.newPaperworkStatus}; stage ${row.previousStage}→${row.newStage}; changed=[${row.changedFields.join(", ")}]`,
    ),
    ``,
    `## Global diff`,
    ``,
    `- Target records changed: **${globalDiffArtifact.targetRecordsChanged}**`,
    `- Non-target records changed: **${globalDiffArtifact.nonTargetRecordsChanged}**`,
    `- Dropbox Sign requests created: **${safety.dropboxSignRequestsCreated}**`,
    `- MEL writes: ${safety.melWrites}`,
    `- Breezy writes: ${safety.breezyWrites}`,
    `- Recruiter changes: ${safety.recruiterChanges}`,
    `- assignedDM changes: ${safety.assignedDmChanges}`,
    `- Advanced beyond Paperwork Sent: ${safety.advancedBeyondPaperworkSent}`,
    ``,
    `## Confirmation`,
    ``,
    `Exactly two signature requests were created. No MEL, Breezy, recruiter assignment, notes, or workflow advancement beyond Paperwork Sent occurred. Stopped immediately after verification.`,
    ``,
  ].join("\n");

  writeArtifact("p221-signature-requests.json", signatureArtifact);
  writeArtifact("p221-verification.json", verificationArtifact);
  writeArtifact("p221-global-diff.json", globalDiffArtifact);
  writeArtifact("p221-dropbox-sign-send-report.md", report);

  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/p221-controlled-dropbox-sign-send-operator-local.json",
    `${JSON.stringify(
      {
        generatedAt,
        approvedBy: P221_APPROVED_BY,
        candidateIds: P221_TARGETS.map((t) => t.candidateId),
        sendResults,
        verificationRows,
        globalDiff,
        safety,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    "[P221] Complete — exactly 2 signature requests created. Stopped after verification.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
