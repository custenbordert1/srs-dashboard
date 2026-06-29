import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import {
  createOnboardingId,
  findActiveOnboardingRecord,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { P84_SOURCE_PHASE } from "@/lib/autonomous-paperwork-send-engine/types";

export async function prepareOnboardingSend(input: {
  candidateId: string;
  templateKey: OnboardingTemplateKey;
  orchestratorRunId?: string;
  actionType?: string;
  now?: string;
}): Promise<CandidateOnboardingRecord> {
  const now = input.now ?? new Date().toISOString();
  const existing = await findActiveOnboardingRecord(input.candidateId);
  if (existing && (existing.status === "queued" || existing.status === "retry_scheduled" || existing.status === "sending")) {
    return existing;
  }

  const record: CandidateOnboardingRecord = {
    onboardingId: existing?.onboardingId ?? createOnboardingId(),
    orchestratorRunId: input.orchestratorRunId,
    candidateId: input.candidateId,
    status: "queued",
    paperworkComplete: false,
    readyForMel: false,
    actionType: input.actionType,
    createdAt: existing?.createdAt ?? now,
    retryCount: existing?.retryCount ?? 0,
    escalated: existing?.escalated ?? false,
    statusHistory: [
      ...(existing?.statusHistory ?? []),
      {
        at: now,
        status: "queued",
        detail: `${P84_SOURCE_PHASE} — queued for autonomous paperwork send`,
      },
    ],
  };

  await recordCandidateOnboarding(record);
  return record;
}
