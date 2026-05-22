export type OnboardingTemplateKey =
  | "independent_contractor_agreement"
  | "wage_consent"
  | "wage_payment_election"
  | "onboarding_packet";

export type OnboardingTemplateDefinition = {
  key: OnboardingTemplateKey;
  label: string;
  envVar: string;
  /** Dropbox Sign template signer role name (must match template). */
  signerRole: string;
};

export const ONBOARDING_TEMPLATE_REGISTRY: Record<OnboardingTemplateKey, OnboardingTemplateDefinition> = {
  independent_contractor_agreement: {
    key: "independent_contractor_agreement",
    label: "Independent Contractor Agreement",
    envVar: "DROPBOX_SIGN_TEMPLATE_INDEPENDENT_CONTRACTOR",
    signerRole: "Signer",
  },
  wage_consent: {
    key: "wage_consent",
    label: "Wage Consent",
    envVar: "DROPBOX_SIGN_TEMPLATE_WAGE_CONSENT",
    signerRole: "Signer",
  },
  wage_payment_election: {
    key: "wage_payment_election",
    label: "Wage Payment Election",
    envVar: "DROPBOX_SIGN_TEMPLATE_WAGE_PAYMENT_ELECTION",
    signerRole: "Signer",
  },
  onboarding_packet: {
    key: "onboarding_packet",
    label: "Onboarding Packet",
    envVar: "DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET",
    signerRole: "Signer",
  },
};

export const ONBOARDING_TEMPLATE_KEYS = Object.keys(
  ONBOARDING_TEMPLATE_REGISTRY,
) as OnboardingTemplateKey[];

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return !value || lower === "placeholder" || lower.startsWith("your-");
}

export function isOnboardingTemplateKey(value: string): value is OnboardingTemplateKey {
  return ONBOARDING_TEMPLATE_KEYS.includes(value as OnboardingTemplateKey);
}

export function resolveTemplateId(key: OnboardingTemplateKey): string | null {
  const def = ONBOARDING_TEMPLATE_REGISTRY[key];
  const raw = process.env[def.envVar]?.trim() ?? "";
  if (!raw || isPlaceholder(raw)) return null;
  return raw;
}

export type ResolvedOnboardingTemplate = {
  key: OnboardingTemplateKey;
  label: string;
  templateId: string;
  signerRole: string;
  configured: boolean;
};

export function listOnboardingTemplates(): ResolvedOnboardingTemplate[] {
  return ONBOARDING_TEMPLATE_KEYS.map((key) => {
    const def = ONBOARDING_TEMPLATE_REGISTRY[key];
    const templateId = resolveTemplateId(key);
    return {
      key,
      label: def.label,
      templateId: templateId ?? "",
      signerRole: def.signerRole,
      configured: Boolean(templateId),
    };
  });
}

export type SendPacketValidationResult =
  | { ok: true; templateKey: OnboardingTemplateKey; templateId: string; signerRole: string }
  | { ok: false; error: string; field?: string };

export function validateSendPacketRequest(body: unknown): SendPacketValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body is required.", field: "body" };
  }
  const input = body as Record<string, unknown>;
  const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
  const candidateName = typeof input.candidateName === "string" ? input.candidateName.trim() : "";
  const candidateEmail = typeof input.candidateEmail === "string" ? input.candidateEmail.trim() : "";
  const templateKeyRaw = typeof input.templateKey === "string" ? input.templateKey.trim() : "";

  if (!candidateId) return { ok: false, error: "candidateId is required.", field: "candidateId" };
  if (!candidateName) return { ok: false, error: "candidateName is required.", field: "candidateName" };
  if (!candidateEmail) return { ok: false, error: "candidateEmail is required.", field: "candidateEmail" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
    return { ok: false, error: "candidateEmail must be a valid email address.", field: "candidateEmail" };
  }
  if (!templateKeyRaw) return { ok: false, error: "templateKey is required.", field: "templateKey" };
  if (!isOnboardingTemplateKey(templateKeyRaw)) {
    return { ok: false, error: `Unknown templateKey: ${templateKeyRaw}`, field: "templateKey" };
  }

  const templateId = resolveTemplateId(templateKeyRaw);
  if (!templateId) {
    const def = ONBOARDING_TEMPLATE_REGISTRY[templateKeyRaw];
    return {
      ok: false,
      error: `Template ${def.label} is not configured. Set ${def.envVar} in .env.local.`,
      field: "templateKey",
    };
  }

  return {
    ok: true,
    templateKey: templateKeyRaw,
    templateId,
    signerRole: ONBOARDING_TEMPLATE_REGISTRY[templateKeyRaw].signerRole,
  };
}
