import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";

export type SendOnboardingPacketInput = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  /** Optional Breezy alias fields for server-side normalization. */
  email?: string;
  email_address?: string;
  templateKey: OnboardingTemplateKey;
};

export type SendOnboardingPacketResponse = {
  ok: boolean;
  error?: string;
  signatureRequestId?: string;
  paperworkStatus?: PaperworkStatus;
  workflow?: CandidateWorkflowRecord;
};

export type OnboardingStatusResponse = {
  ok: boolean;
  error?: string;
  signatureRequestId?: string;
  signingStatus?: string;
  paperworkStatus?: PaperworkStatus;
  workflow?: CandidateWorkflowRecord;
};

export async function sendOnboardingPacket(
  input: SendOnboardingPacketInput,
): Promise<SendOnboardingPacketResponse> {
  const res = await fetch("/api/onboarding/send-packet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as SendOnboardingPacketResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Send paperwork failed (${res.status})`);
  }
  return data;
}

export async function checkOnboardingSignatureStatus(
  signatureRequestId: string,
): Promise<OnboardingStatusResponse> {
  const res = await fetch(`/api/onboarding/status/${encodeURIComponent(signatureRequestId)}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as OnboardingStatusResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Status check failed (${res.status})`);
  }
  return data;
}

export type OnboardingConfigResponse = {
  configured: boolean;
  templatesAvailable: boolean;
  templates: Array<{ key: string; label: string; configured: boolean }>;
};

export async function fetchOnboardingConfig(): Promise<OnboardingConfigResponse> {
  const res = await fetch("/api/onboarding/config", { cache: "no-store" });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    configured?: boolean;
    templatesAvailable?: boolean;
    templates?: Array<{ key: string; label: string; configured: boolean }>;
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `Onboarding config failed (${res.status})`);
  }
  const templates = data.templates ?? [];
  const templatesAvailable =
    data.templatesAvailable ?? templates.some((t) => t.configured);
  return {
    configured: Boolean(data.configured),
    templatesAvailable,
    templates,
  };
}
