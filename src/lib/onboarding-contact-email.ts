import { getSignatureRequest } from "@/lib/dropbox-sign";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

export async function resolveOnboardingContactEmail(input: {
  workflow: CandidateWorkflowRecord;
  signatureRequestId?: string | null;
  overrideEmail?: string | null;
}): Promise<string | null> {
  const override = input.overrideEmail?.trim();
  if (override) return override;
  const stored = input.workflow.onboardingContactEmail?.trim();
  if (stored) return stored;
  const sigId = input.signatureRequestId ?? input.workflow.signatureRequestId;
  if (!sigId) return null;
  try {
    const summary = await getSignatureRequest(sigId);
    const email = summary.signatures.map((s) => s.signerEmail.trim()).find(Boolean);
    return email ?? null;
  } catch {
    return null;
  }
}
