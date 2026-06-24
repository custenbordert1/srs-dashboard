import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { CandidateAutomationMode } from "@/lib/candidate-automation-engine/types";
import {
  buildOnboardingDecisions,
  countEligibleForPaperwork,
} from "@/lib/candidate-onboarding-engine/build-onboarding-decisions";
import {
  isCandidateOnboardingActive,
  loadCandidateOnboardingPolicy,
} from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import {
  findActiveOnboardingRecord,
  listCandidateOnboardingRecords,
  recordCandidateOnboarding,
  saveOnboardingRunSummary,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { processSignatureStatus } from "@/lib/candidate-onboarding-engine/process-signature-status";
import { sendPaperworkPacket } from "@/lib/candidate-onboarding-engine/send-paperwork-packet";
import type {
  CandidateOnboardingDecision,
  CandidateOnboardingResult,
} from "@/lib/candidate-onboarding-engine/types";
import { createOnboardingId } from "@/lib/candidate-onboarding-engine/onboarding-record-store";

async function markReadyForMel(input: {
  row: ScoredCandidateWorkflowRow;
  orchestratorRunId?: string;
  byUserId?: string;
  dryRun: boolean;
}): Promise<boolean> {
  if (input.dryRun) return false;

  await upsertCandidateWorkflow({
    candidateId: input.row.candidateId,
    workflowStatus: "Ready for MEL",
    note: "P65.3 onboarding: paperwork complete — candidate prepared for MEL (not loaded).",
    audit: { action: "onboarding_ready_for_mel", byUserId: input.byUserId },
  });

  const existing = await findActiveOnboardingRecord(input.row.candidateId);
  const now = new Date().toISOString();
  await recordCandidateOnboarding({
    onboardingId: existing?.onboardingId ?? createOnboardingId(),
    orchestratorRunId: input.orchestratorRunId,
    candidateId: input.row.candidateId,
    signatureRequestId: existing?.signatureRequestId ?? input.row.signatureRequestId ?? undefined,
    status: "ready_for_mel",
    paperworkComplete: true,
    readyForMel: true,
    createdAt: existing?.createdAt ?? now,
    completedAt: now,
    retryCount: existing?.retryCount ?? 0,
    escalated: existing?.escalated ?? false,
    statusHistory: [
      ...(existing?.statusHistory ?? []),
      { at: now, status: "ready_for_mel", detail: "Prepared for P66 MEL placement" },
    ],
  });
  return true;
}

async function createReminder(input: {
  row: ScoredCandidateWorkflowRow;
  decision: CandidateOnboardingDecision;
  dryRun: boolean;
}): Promise<boolean> {
  if (input.dryRun) return false;
  const followUpDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await upsertCandidateWorkflow({
    candidateId: input.row.candidateId,
    followUpDueAt,
    note: `P65.3 onboarding reminder — ${input.decision.reason}`,
    audit: { action: "onboarding_paperwork_reminder" },
  });
  return true;
}

async function createEscalation(input: {
  row: ScoredCandidateWorkflowRow;
  decision: CandidateOnboardingDecision;
  policy: Awaited<ReturnType<typeof loadCandidateOnboardingPolicy>>;
  orchestratorRunId?: string;
  dryRun: boolean;
}): Promise<boolean> {
  if (input.dryRun) return false;
  if (input.policy.escalation.requireApproval && input.policy.mode !== "automatic") {
    const now = new Date().toISOString();
    await recordCandidateOnboarding({
      onboardingId: createOnboardingId(),
      orchestratorRunId: input.orchestratorRunId,
      candidateId: input.row.candidateId,
      signatureRequestId: input.decision.signatureRequestId,
      status: "pending_approval",
      paperworkComplete: false,
      readyForMel: false,
      createdAt: now,
      retryCount: 0,
      escalated: true,
      statusHistory: [
        { at: now, status: "pending_approval", detail: `Escalation pending approval — ${input.decision.reason}` },
      ],
    });
    return true;
  }

  const now = new Date().toISOString();
  await recordCandidateOnboarding({
    onboardingId: createOnboardingId(),
    orchestratorRunId: input.orchestratorRunId,
    candidateId: input.row.candidateId,
    signatureRequestId: input.decision.signatureRequestId,
    status: "sent",
    paperworkComplete: false,
    readyForMel: false,
    createdAt: now,
    retryCount: 0,
    escalated: true,
    statusHistory: [{ at: now, status: "sent", detail: `Escalation created — ${input.decision.reason}` }],
  });
  return true;
}

export async function runCandidateOnboarding(input: {
  candidates: ScoredCandidateWorkflowRow[];
  orchestratorRunId?: string;
  automationMode?: CandidateAutomationMode;
  byUserId?: string;
}): Promise<CandidateOnboardingResult> {
  const policy = await loadCandidateOnboardingPolicy();
  const errors: string[] = [];
  const warnings: string[] = [];
  const candidatesById = new Map(input.candidates.map((row) => [row.candidateId, row]));

  const eligibleForPaperwork = countEligibleForPaperwork(input.candidates);
  let packetsSent = 0;
  let statusSynced = 0;
  let remindersCreated = 0;
  let escalationsCreated = 0;
  let readyForMelCount = 0;
  let blockedByPolicy = 0;
  let blockedByBatchCap = 0;
  let skipped = 0;
  let sendsThisRun = 0;
  let escalationsThisRun = 0;

  if (!isCandidateOnboardingActive(policy)) {
    const summary = {
      runAt: new Date().toISOString(),
      orchestratorRunId: input.orchestratorRunId,
      dryRun: policy.dryRun,
      eligibleForPaperwork,
      packetsSent: 0,
      blockedByPolicy: eligibleForPaperwork,
      blockedByBatchCap: 0,
      remindersCreated: 0,
      escalationsCreated: 0,
      readyForMelCount: 0,
    };
    await saveOnboardingRunSummary(summary);
    return {
      ok: true,
      dryRun: policy.dryRun,
      eligibleForPaperwork,
      packetsSent: 0,
      statusSynced: 0,
      remindersCreated: 0,
      escalationsCreated: 0,
      readyForMelCount: 0,
      blockedByPolicy: eligibleForPaperwork,
      blockedByBatchCap: 0,
      skipped: input.candidates.length,
      errors,
      warnings: ["Onboarding policy disabled — skipped all decisions."],
    };
  }

  const existingEscalations = new Set(
    (await listCandidateOnboardingRecords(500))
      .filter((row) => row.escalated)
      .map((row) => row.candidateId),
  );

  const decisions = buildOnboardingDecisions({
    candidates: input.candidates,
    reminderHours: policy.reminderHours,
    escalationOverdueHours: policy.escalationOverdueHours,
    existingEscalations,
  });

  if (policy.dryRun) {
    for (const decision of decisions) {
      if (decision.decisionType === "send-packet" && !policy.send.enabled) blockedByPolicy += 1;
      if (
        decision.decisionType === "escalate" &&
        escalationsThisRun >= policy.maxEscalationsPerRun
      ) {
        blockedByBatchCap += 1;
      } else if (decision.decisionType === "escalate") {
        escalationsThisRun += 1;
      }
    }
    const summary = {
      runAt: new Date().toISOString(),
      orchestratorRunId: input.orchestratorRunId,
      dryRun: true,
      eligibleForPaperwork,
      packetsSent: 0,
      blockedByPolicy,
      blockedByBatchCap,
      remindersCreated: decisions.filter((d) => d.decisionType === "reminder").length,
      escalationsCreated: 0,
      readyForMelCount: decisions.filter((d) => d.decisionType === "mark-ready-for-mel").length,
    };
    await saveOnboardingRunSummary(summary);
    return {
      ok: true,
      dryRun: true,
      eligibleForPaperwork,
      packetsSent: 0,
      statusSynced: 0,
      remindersCreated: summary.remindersCreated,
      escalationsCreated: 0,
      readyForMelCount: summary.readyForMelCount,
      blockedByPolicy,
      blockedByBatchCap,
      skipped: decisions.length,
      errors,
      warnings: ["Dry run — no onboarding actions performed."],
    };
  }

  for (const decision of decisions) {
    const row = candidatesById.get(decision.candidateId);
    if (!row) {
      skipped += 1;
      continue;
    }

    try {
      switch (decision.decisionType) {
        case "send-packet": {
          if (!policy.send.enabled) {
            blockedByPolicy += 1;
            continue;
          }
          if (sendsThisRun >= policy.maxSendsPerRun) {
            blockedByBatchCap += 1;
            warnings.push(`Send batch cap (${policy.maxSendsPerRun}) reached for ${row.candidateId}`);
            continue;
          }
          const sent = await sendPaperworkPacket({
            row,
            policy,
            orchestratorRunId: input.orchestratorRunId,
            byUserId: input.byUserId,
          });
          sendsThisRun += 1;
          if (sent.ok && sent.sent) packetsSent += 1;
          else if (!sent.ok) errors.push(sent.error);
          break;
        }
        case "sync-status": {
          if (!decision.signatureRequestId) continue;
          const synced = await processSignatureStatus({
            signatureRequestId: decision.signatureRequestId,
            byUserId: input.byUserId,
          });
          if (synced.ok) statusSynced += 1;
          else if (synced.error) errors.push(synced.error);
          break;
        }
        case "reminder": {
          if (!policy.reminders.enabled) {
            blockedByPolicy += 1;
            continue;
          }
          if (await createReminder({ row, decision, dryRun: false })) remindersCreated += 1;
          break;
        }
        case "escalate": {
          if (!policy.escalation.enabled) {
            blockedByPolicy += 1;
            continue;
          }
          if (escalationsThisRun >= policy.maxEscalationsPerRun) {
            blockedByBatchCap += 1;
            continue;
          }
          if (await createEscalation({ row, decision, policy, orchestratorRunId: input.orchestratorRunId, dryRun: false })) {
            escalationsCreated += 1;
            escalationsThisRun += 1;
          }
          break;
        }
        case "mark-ready-for-mel": {
          if (await markReadyForMel({ row, orchestratorRunId: input.orchestratorRunId, byUserId: input.byUserId, dryRun: false })) {
            readyForMelCount += 1;
          }
          break;
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Onboarding action failed.");
    }
  }

  await saveOnboardingRunSummary({
    runAt: new Date().toISOString(),
    orchestratorRunId: input.orchestratorRunId,
    dryRun: false,
    eligibleForPaperwork,
    packetsSent,
    blockedByPolicy,
    blockedByBatchCap,
    remindersCreated,
    escalationsCreated,
    readyForMelCount,
  });

  return {
    ok: errors.length === 0,
    dryRun: false,
    eligibleForPaperwork,
    packetsSent,
    statusSynced,
    remindersCreated,
    escalationsCreated,
    readyForMelCount,
    blockedByPolicy,
    blockedByBatchCap,
    skipped,
    errors,
    warnings,
  };
}
