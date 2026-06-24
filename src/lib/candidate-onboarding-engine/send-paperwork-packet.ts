import { sendCandidatePaperwork } from "@/lib/hiring-automation-engine/send-candidate-paperwork";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  createOnboardingId,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";

export type SendPaperworkPacketResult =
  | { ok: true; record: CandidateOnboardingRecord; sent: boolean }
  | { ok: false; error: string; record?: CandidateOnboardingRecord };

function appendHistory(
  record: CandidateOnboardingRecord,
  status: CandidateOnboardingRecord["status"],
  detail?: string,
): CandidateOnboardingRecord {
  return {
    ...record,
    status,
    statusHistory: [...record.statusHistory, { at: new Date().toISOString(), status, detail }],
  };
}

export async function sendPaperworkPacket(input: {
  row: ScoredCandidateWorkflowRow;
  policy: CandidateOnboardingPolicy;
  orchestratorRunId?: string;
  byUserId?: string;
  dryRun?: boolean;
}): Promise<SendPaperworkPacketResult> {
  const now = new Date().toISOString();
  let record: CandidateOnboardingRecord = {
    onboardingId: createOnboardingId(),
    orchestratorRunId: input.orchestratorRunId,
    candidateId: input.row.candidateId,
    status: "draft",
    paperworkComplete: false,
    readyForMel: false,
    actionType: input.row.actionType ?? undefined,
    createdAt: now,
    retryCount: 0,
    escalated: false,
    statusHistory: [{ at: now, status: "draft", detail: "Packet drafted" }],
  };

  if (input.dryRun || input.policy.dryRun) {
    record = appendHistory(record, "draft", "Dry run — packet not sent");
    await recordCandidateOnboarding(record);
    return { ok: true, record, sent: false };
  }

  const requiresApproval =
    input.policy.mode === "semi-automatic" || input.policy.send.requireApproval;

  if (requiresApproval && input.policy.mode !== "automatic") {
    record = appendHistory(record, "pending_approval", "Awaiting approval to send");
    await recordCandidateOnboarding(record);
    return { ok: true, record, sent: false };
  }

  if (!input.policy.send.enabled) {
    record = appendHistory(record, "failed", "Send disabled in onboarding policy");
    record.failedAt = now;
    record.failureReason = "Send disabled in onboarding policy";
    await recordCandidateOnboarding(record);
    return { ok: false, error: record.failureReason, record };
  }

  const result = await sendCandidatePaperwork({
    candidateId: input.row.candidateId,
    candidateName: `${input.row.firstName} ${input.row.lastName}`.trim() || input.row.email,
    candidateEmail: input.row.email,
    byUserId: input.byUserId,
  });

  if (!result.ok) {
    record = appendHistory(record, "failed", result.error);
    record.failedAt = now;
    record.failureReason = result.error;
    await recordCandidateOnboarding(record);
    return { ok: false, error: result.error, record };
  }

  record.signatureRequestId = result.signatureRequestId;
  record.sentAt = now;
  record = appendHistory(record, "sent", `Packet sent — ${result.signatureRequestId}`);
  await recordCandidateOnboarding(record);
  return { ok: true, record, sent: true };
}
