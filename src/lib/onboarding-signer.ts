import type { BreezyCandidate } from "@/lib/breezy-api";
import type { DropboxSignSignerInput } from "@/lib/dropbox-sign";
import {
  ONBOARDING_TEMPLATE_REGISTRY,
  type OnboardingTemplateKey,
} from "@/lib/onboarding-template-registry";

const PRIMARY_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractEmailString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = extractEmailString(item);
      if (email) return email;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return extractEmailString(
      record.email_address ?? record.email ?? record.value ?? record.address,
    );
  }
  return null;
}

/** Normalize Breezy primary email (email / email_address) for Dropbox Sign recipients. */
export function normalizePrimaryEmail(...sources: unknown[]): string | null {
  for (const source of sources) {
    const raw = extractEmailString(source);
    if (!raw) continue;
    const email = raw.trim().toLowerCase();
    if (PRIMARY_EMAIL_RE.test(email)) return email;
  }
  return null;
}

export function candidatePrimaryEmail(
  candidate: Pick<BreezyCandidate, "email"> & { email_address?: string },
): string | null {
  return normalizePrimaryEmail(candidate.email, candidate.email_address);
}

export function hasCandidatePrimaryEmail(
  candidate: Pick<BreezyCandidate, "email"> & { email_address?: string },
): boolean {
  return candidatePrimaryEmail(candidate) !== null;
}

export function maskEmailForLog(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return "***";
  const maskedLocal =
    local.length <= 2 ? "**" : `${local[0] ?? ""}***${local[local.length - 1] ?? ""}`;
  return `${maskedLocal}@${domain}`;
}

export function resolveSignerRoleForTemplate(templateKey: OnboardingTemplateKey): string {
  const envRole = process.env.DROPBOX_SIGN_SIGNER_ROLE?.trim();
  if (envRole) return envRole;
  return ONBOARDING_TEMPLATE_REGISTRY[templateKey].signerRole;
}

export function buildTemplateSignerPayload(input: {
  templateKey: OnboardingTemplateKey;
  candidateName: string;
  emailSources: unknown[];
}):
  | { ok: true; signer: DropboxSignSignerInput; recipientEmail: string }
  | { ok: false; error: string; field?: string } {
  const recipientEmail = normalizePrimaryEmail(...input.emailSources);
  if (!recipientEmail) {
    return {
      ok: false,
      error: "Candidate email missing or invalid.",
      field: "candidateEmail",
    };
  }

  const name = input.candidateName.trim() || recipientEmail;
  const role = resolveSignerRoleForTemplate(input.templateKey).trim();
  if (!role) {
    return { ok: false, error: "Template signer role is not configured.", field: "templateKey" };
  }

  return {
    ok: true,
    recipientEmail,
    signer: {
      role,
      name,
      emailAddress: recipientEmail,
    },
  };
}
