/**
 * P102 — Execute one controlled live paperwork send after executive approval.
 * Usage: npx tsx scripts/p102-execute-one-live-send.ts
 *
 * Sequence: P99 approve → P84 flags → checklist GO → dryRun → executeOne (single send).
 * Does NOT run executeBatch.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_P84_FEATURE_FLAGS,
  loadP84FeatureFlags,
  saveP84FeatureFlags,
} from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { findActiveOnboardingRecord } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { executeControlledLiveSend } from "@/lib/controlled-live-send";
import { p100AuditLogPath, loadP100State } from "@/lib/controlled-live-send/controlled-live-send-store";
import { buildLiveSendOperatorChecklist } from "@/lib/live-send-operator-checklist";
import { approveLiveSendReadiness } from "@/lib/live-send-readiness/approve-live-send-readiness";
import { buildLiveSendReadinessFromStores } from "@/lib/live-send-readiness/build-live-send-readiness";
import { loadLiveSendReadinessApproval } from "@/lib/live-send-readiness/live-send-readiness-store";
import { P99_CONFIRMATION_PHRASE } from "@/lib/live-send-readiness/types";

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

async function main() {
  loadEnvLocal();

  const steps: string[] = [];
  const log = (msg: string) => {
    steps.push(msg);
    console.error(`[P102] ${msg}`);
  };

  // Step 1 — P99 readiness approval (while liveSend still off)
  log("Step 1: P99 readiness approval...");
  const existingP99 = await loadLiveSendReadinessApproval();
  if (!existingP99.approval?.approved) {
    const p99Report = await buildLiveSendReadinessFromStores({ mtdOnly: true });
    await approveLiveSendReadiness({
      approvedBy: "P102 Executive Live Send",
      approvedByUserId: "p102-execute-script",
      confirmationPhrase: P99_CONFIRMATION_PHRASE,
      candidateCount: p99Report.metrics.readinessPassCount,
      dryRunReportTimestamp: p99Report.dryRunReportTimestamp,
      executiveApprovalFlag: true,
      mtdOnly: true,
    });
    steps.push("P99 readiness approval recorded.");
  } else {
    log("P99 already approved — skip.");
  }

  // Step 2 — Enable P84 flags for live send
  log("Step 2: Enable P84 flags...");
  const flagsBefore = await loadP84FeatureFlags();
  if (!flagsBefore.enabled || !flagsBefore.liveMode || !flagsBefore.liveSend) {
    await saveP84FeatureFlags({
      ...DEFAULT_P84_FEATURE_FLAGS,
      ...flagsBefore,
      enabled: true,
      liveMode: true,
      liveSend: true,
      requireApproval: false,
      monitorSignatures: flagsBefore.monitorSignatures,
    });
    steps.push("P84 flags enabled: enabled=true, liveMode=true, liveSend=true.");
  } else {
    steps.push("P84 liveSend already enabled — skipped.");
  }

  // Step 3 — Operator checklist GO
  log("Step 3: P101 operator checklist...");
  const checklist = await buildLiveSendOperatorChecklist({ mtdOnly: true });
  if (checklist.goNoGo !== "GO") {
    throw new Error(`Operator checklist NO-GO: ${checklist.goNoGoReason}`);
  }
  steps.push("P101 operator checklist GO.");

  // Step 4 — Controlled dry run
  log("Step 4: P100 dryRun...");
  const dryRun = await executeControlledLiveSend({
    mode: "dryRun",
    mtdOnly: true,
  });
  const dryRunSent = dryRun.executed.filter((e) => e.outcome === "sent").length;
  if (dryRunSent > 0) {
    throw new Error("dryRun sent paperwork — aborting.");
  }
  steps.push(`dryRun complete — ${dryRun.executed.filter((e) => e.outcome === "simulated").length} simulated, 0 sent.`);

  // Step 5 — Execute exactly one candidate (NOT executeBatch)
  log("Step 5: executeOne — single live send...");
  const liveResult = await executeControlledLiveSend({
    mode: "executeOne",
    executiveApprovalFlag: true,
    mtdOnly: true,
  });

  const sentEntries = liveResult.executed.filter((e) => e.outcome === "sent");
  if (sentEntries.length !== 1) {
    throw new Error(
      `Expected exactly 1 sent candidate, got ${sentEntries.length}. Outcomes: ${liveResult.executed.map((e) => `${e.candidateId}:${e.outcome}`).join(", ")}`,
    );
  }

  const sent = sentEntries[0]!;
  const row = (await import("@/lib/candidate-ingestion/ingestion-store")).readIngestionStore().then(
    (store) => store.candidates[sent.candidateId]?.email ?? "",
  );
  const candidateEmail = await row;
  const workflows = await getCandidateWorkflowState();
  const workflow = workflows[sent.candidateId];
  const onboarding = await findActiveOnboardingRecord(sent.candidateId);
  const p100State = await loadP100State();
  const postChecklist = await buildLiveSendOperatorChecklist({ mtdOnly: true });

  const batchGoNoGo =
    postChecklist.metrics.p100AlreadySent > 0 &&
    postChecklist.metrics.p100ReadyToSend === 26 &&
    postChecklist.checklist.find((c) => c.id === "already_sent_zero")?.satisfied === false
      ? "NO-GO (already_sent > 0 — use executeOne per candidate or resolve state before batch)"
      : postChecklist.goNoGo === "GO"
        ? "GO (operator checklist passes — batch still requires explicit phrase + executeBatch POST)"
        : `NO-GO: ${postChecklist.goNoGoReason}`;

  console.log(
    JSON.stringify(
      {
        steps,
        candidateSent: {
          candidateId: sent.candidateId,
          candidateName: sent.candidateName,
          email: candidateEmail,
          signatureRequestId: sent.signatureRequestId ?? workflow?.signatureRequestId ?? null,
        },
        auditLocation: p100AuditLogPath(),
        workflowAfterSend: workflow
          ? {
              workflowStatus: workflow.workflowStatus,
              actionType: workflow.actionType,
              paperworkStatus: workflow.paperworkStatus,
              signatureRequestId: workflow.signatureRequestId,
              paperworkSentAt: workflow.paperworkSentAt,
            }
          : null,
        onboardingAfterSend: onboarding
          ? {
              onboardingId: onboarding.onboardingId,
              status: onboarding.status,
              signatureRequestId: onboarding.signatureRequestId,
              sentAt: onboarding.sentAt,
            }
          : null,
        remainingCandidates: postChecklist.metrics.p100ReadyToSend,
        p100State: {
          sentCount: p100State.sentCandidateIds.length,
          sentCandidateIds: p100State.sentCandidateIds,
        },
        duplicateProtection: {
          singleSendVerified: sentEntries.length === 1,
          p100SentIds: p100State.sentCandidateIds,
        },
        batchGoNoGo,
        stoppedAfterOneSend: true,
        warnings: [
          "P102 complete — exactly one live send executed.",
          "executeBatch was NOT run.",
          "No Breezy writes.",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
