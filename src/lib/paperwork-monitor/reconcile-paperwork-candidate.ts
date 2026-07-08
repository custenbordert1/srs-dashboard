import {
  createOnboardingId,
  findActiveOnboardingRecord,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { processSignatureStatus } from "@/lib/candidate-onboarding-engine/process-signature-status";
import { getCandidateWorkflowBundle, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { getSignatureRequest, readDropboxSignConfig } from "@/lib/dropbox-sign";
import { appendMonitorAudit } from "@/lib/paperwork-monitor/monitor-store";
import { normalizeDropboxMonitorStatus } from "@/lib/paperwork-monitor/normalize-dropbox-status";
import type { ActivePaperworkPacket } from "@/lib/paperwork-monitor/select-active-packets";
import type {
  DropboxMonitorStatus,
  PaperworkMonitorCandidateResult,
  PaperworkMonitorCandidateTracking,
} from "@/lib/paperwork-monitor/types";

async function advanceOnboardingAfterSign(input: {
  packet: ActivePaperworkPacket;
  byUserId?: string;
}): Promise<boolean> {
  const bundle = await getCandidateWorkflowBundle();
  const workflow = bundle.workflows[input.packet.candidateId];
  if (!workflow || workflow.workflowStatus !== "Signed") return false;

  const existingOnboarding = await findActiveOnboardingRecord(input.packet.candidateId);
  if (existingOnboarding?.status === "ready_for_mel" || existingOnboarding?.readyForMel) return false;

  await upsertCandidateWorkflow({
    candidateId: input.packet.candidateId,
    workflowStatus: "Ready for MEL",
    note: "P107 — paperwork signed; candidate ready for onboarding (MEL).",
    audit: { action: "onboarding_ready_for_mel", byUserId: input.byUserId },
  });

  const now = new Date().toISOString();
  await recordCandidateOnboarding({
    onboardingId: existingOnboarding?.onboardingId ?? createOnboardingId(),
    candidateId: input.packet.candidateId,
    signatureRequestId: existingOnboarding?.signatureRequestId ?? input.packet.signatureRequestId,
    status: "ready_for_mel",
    paperworkComplete: true,
    readyForMel: true,
    createdAt: existingOnboarding?.createdAt ?? now,
    completedAt: existingOnboarding?.completedAt ?? now,
    retryCount: existingOnboarding?.retryCount ?? 0,
    escalated: existingOnboarding?.escalated ?? false,
    statusHistory: [
      ...(existingOnboarding?.statusHistory ?? []),
      { at: now, status: "ready_for_mel", detail: "P107 — automatic onboarding after signature" },
    ],
  });
  return true;
}

function inferLocalDropboxStatus(input: {
  workflow: ActivePaperworkPacket["workflow"];
  onboarding: ActivePaperworkPacket["onboarding"];
}): DropboxMonitorStatus {
  if (input.workflow.paperworkStatus === "signed" || input.workflow.workflowStatus === "Signed") {
    return "signed";
  }
  if (input.workflow.paperworkStatus === "viewed") return "viewed";
  if (input.onboarding?.status === "declined") return "declined";
  if (input.onboarding?.status === "expired") return "expired";
  return "awaiting_signature";
}

export async function reconcilePaperworkCandidate(input: {
  packet: ActivePaperworkPacket;
  existingTracking: PaperworkMonitorCandidateTracking | null;
  dryRun: boolean;
  byUserId?: string;
}): Promise<{
  result: PaperworkMonitorCandidateResult;
  tracking: PaperworkMonitorCandidateTracking;
}> {
  const timeline: string[] = ["Paperwork Sent"];
  const prior = input.existingTracking;
  let dropboxStatus: DropboxMonitorStatus = prior?.lastDropboxStatus ?? "awaiting_signature";
  let error: string | null = null;
  let synced = false;
  let stateChanged = false;

  const config = readDropboxSignConfig();
  if (!config) {
    return {
      result: {
        candidateId: input.packet.candidateId,
        candidateName: input.packet.candidateName,
        signatureRequestId: input.packet.signatureRequestId,
        dropboxStatus,
        paperworkStatus: input.packet.workflow.paperworkStatus,
        workflowStatus: input.packet.workflow.workflowStatus,
        onboardingStatus: input.packet.onboarding?.status ?? null,
        viewedAt: input.packet.workflow.paperworkViewedAt,
        signedAt: input.packet.workflow.paperworkSignedAt,
        synced: false,
        stateChanged: false,
        reminderGenerated: null,
        error: "DROPBOX_SIGN_API_KEY not configured — cannot poll live status.",
        timeline,
      },
      tracking: prior ?? {
        candidateId: input.packet.candidateId,
        candidateName: input.packet.candidateName,
        signatureRequestId: input.packet.signatureRequestId,
        lastDropboxStatus: dropboxStatus,
        viewedAt: input.packet.workflow.paperworkViewedAt,
        signedAt: input.packet.workflow.paperworkSignedAt,
        completedAt: input.packet.onboarding?.completedAt ?? null,
        lastCheckedAt: new Date().toISOString(),
        reminderCount: 0,
        lastReminderSentAt: null,
        reminderHistory: [],
        needsAttention: false,
        workflowStatus: input.packet.workflow.workflowStatus,
        onboardingStatus: input.packet.onboarding?.status ?? null,
      },
    };
  }

  try {
    if (input.dryRun) {
      dropboxStatus = inferLocalDropboxStatus({
        workflow: input.packet.workflow,
        onboarding: input.packet.onboarding,
      });
      if (dropboxStatus === "viewed" || dropboxStatus === "signed") timeline.push("Viewed");
      if (dropboxStatus === "signed") timeline.push("Signed");
      synced = true;
    } else {
      const signature = await getSignatureRequest(input.packet.signatureRequestId);
      dropboxStatus = normalizeDropboxMonitorStatus(signature);
      const viewedAt =
        signature.signatures.find((s) => s.lastViewedAt)?.lastViewedAt ??
        input.packet.workflow.paperworkViewedAt;
      const signedAt =
        signature.signatures.find((s) => s.signedAt)?.signedAt ?? input.packet.workflow.paperworkSignedAt;

      if (dropboxStatus === "viewed" || dropboxStatus === "signed") timeline.push("Viewed");
      if (dropboxStatus === "signed") timeline.push("Signed");

      const priorStatus = prior?.lastDropboxStatus;
      stateChanged = priorStatus !== dropboxStatus;

      const alreadySigned =
        input.packet.workflow.paperworkStatus === "signed" &&
        input.packet.workflow.workflowStatus === "Signed";

      if (!alreadySigned || dropboxStatus === "viewed") {
        const processed = await processSignatureStatus({
          signatureRequestId: input.packet.signatureRequestId,
          signature,
          byUserId: input.byUserId ?? "p107-monitor",
        });
        if (!processed.ok) {
          error = processed.error ?? "processSignatureStatus failed";
        } else {
          synced = true;
          if (processed.paperworkStatus === "signed") {
            const advanced = await advanceOnboardingAfterSign({
              packet: input.packet,
              byUserId: input.byUserId,
            });
            if (advanced) timeline.push("Onboarding Started", "Ready For Work");
          }
        }
      } else if (dropboxStatus === "signed") {
        const advanced = await advanceOnboardingAfterSign({
          packet: input.packet,
          byUserId: input.byUserId,
        });
        if (advanced) {
          synced = true;
          timeline.push("Onboarding Started", "Ready For Work");
        }
      }

      if (stateChanged) {
        await appendMonitorAudit({
          action: "status_sync",
          candidateId: input.packet.candidateId,
          signatureRequestId: input.packet.signatureRequestId,
          from: priorStatus ?? null,
          to: dropboxStatus,
        });
      }

      const bundle = await getCandidateWorkflowBundle();
      const workflow = bundle.workflows[input.packet.candidateId];
      const onboarding = await findActiveOnboardingRecord(input.packet.candidateId);

      const tracking: PaperworkMonitorCandidateTracking = {
        candidateId: input.packet.candidateId,
        candidateName: input.packet.candidateName,
        signatureRequestId: input.packet.signatureRequestId,
        lastDropboxStatus: dropboxStatus,
        viewedAt: workflow?.paperworkViewedAt ?? viewedAt ?? prior?.viewedAt ?? null,
        signedAt: workflow?.paperworkSignedAt ?? signedAt ?? prior?.signedAt ?? null,
        completedAt: onboarding?.completedAt ?? prior?.completedAt ?? null,
        lastCheckedAt: new Date().toISOString(),
        reminderCount: prior?.reminderCount ?? 0,
        lastReminderSentAt: prior?.lastReminderSentAt ?? null,
        reminderHistory: prior?.reminderHistory ?? [],
        needsAttention: prior?.needsAttention ?? false,
        workflowStatus: workflow?.workflowStatus ?? input.packet.workflow.workflowStatus,
        onboardingStatus: onboarding?.status ?? input.packet.onboarding?.status ?? null,
      };

      return {
        result: {
          candidateId: input.packet.candidateId,
          candidateName: input.packet.candidateName,
          signatureRequestId: input.packet.signatureRequestId,
          dropboxStatus,
          paperworkStatus: workflow?.paperworkStatus ?? input.packet.workflow.paperworkStatus,
          workflowStatus: tracking.workflowStatus,
          onboardingStatus: tracking.onboardingStatus,
          viewedAt: tracking.viewedAt,
          signedAt: tracking.signedAt,
          synced,
          stateChanged,
          reminderGenerated: null,
          error,
          timeline,
        },
        tracking,
      };
    }

    const priorStatus = prior?.lastDropboxStatus;
    stateChanged = priorStatus !== dropboxStatus;

    const bundle = await getCandidateWorkflowBundle();
    const workflow = bundle.workflows[input.packet.candidateId];
    const onboarding = await findActiveOnboardingRecord(input.packet.candidateId);
    const viewedAt =
      workflow?.paperworkViewedAt ?? input.packet.workflow.paperworkViewedAt ?? prior?.viewedAt ?? null;
    const signedAt =
      workflow?.paperworkSignedAt ?? input.packet.workflow.paperworkSignedAt ?? prior?.signedAt ?? null;

    const tracking: PaperworkMonitorCandidateTracking = {
      candidateId: input.packet.candidateId,
      candidateName: input.packet.candidateName,
      signatureRequestId: input.packet.signatureRequestId,
      lastDropboxStatus: dropboxStatus,
      viewedAt: workflow?.paperworkViewedAt ?? viewedAt ?? prior?.viewedAt ?? null,
      signedAt: workflow?.paperworkSignedAt ?? signedAt ?? prior?.signedAt ?? null,
      completedAt: onboarding?.completedAt ?? prior?.completedAt ?? null,
      lastCheckedAt: new Date().toISOString(),
      reminderCount: prior?.reminderCount ?? 0,
      lastReminderSentAt: prior?.lastReminderSentAt ?? null,
      reminderHistory: prior?.reminderHistory ?? [],
      needsAttention: prior?.needsAttention ?? false,
      workflowStatus: workflow?.workflowStatus ?? input.packet.workflow.workflowStatus,
      onboardingStatus: onboarding?.status ?? input.packet.onboarding?.status ?? null,
    };

    return {
      result: {
        candidateId: input.packet.candidateId,
        candidateName: input.packet.candidateName,
        signatureRequestId: input.packet.signatureRequestId,
        dropboxStatus,
        paperworkStatus: workflow?.paperworkStatus ?? input.packet.workflow.paperworkStatus,
        workflowStatus: tracking.workflowStatus,
        onboardingStatus: tracking.onboardingStatus,
        viewedAt: tracking.viewedAt,
        signedAt: tracking.signedAt,
        synced,
        stateChanged,
        reminderGenerated: null,
        error,
        timeline,
      },
      tracking,
    };
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    return {
      result: {
        candidateId: input.packet.candidateId,
        candidateName: input.packet.candidateName,
        signatureRequestId: input.packet.signatureRequestId,
        dropboxStatus,
        paperworkStatus: input.packet.workflow.paperworkStatus,
        workflowStatus: input.packet.workflow.workflowStatus,
        onboardingStatus: input.packet.onboarding?.status ?? null,
        viewedAt: input.packet.workflow.paperworkViewedAt,
        signedAt: input.packet.workflow.paperworkSignedAt,
        synced: false,
        stateChanged: false,
        reminderGenerated: null,
        error,
        timeline,
      },
      tracking: prior ?? {
        candidateId: input.packet.candidateId,
        candidateName: input.packet.candidateName,
        signatureRequestId: input.packet.signatureRequestId,
        lastDropboxStatus: dropboxStatus,
        viewedAt: input.packet.workflow.paperworkViewedAt,
        signedAt: input.packet.workflow.paperworkSignedAt,
        completedAt: null,
        lastCheckedAt: new Date().toISOString(),
        reminderCount: 0,
        lastReminderSentAt: null,
        reminderHistory: [],
        needsAttention: false,
        workflowStatus: input.packet.workflow.workflowStatus,
        onboardingStatus: input.packet.onboarding?.status ?? null,
      },
    };
  }
}
