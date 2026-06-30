import { normalizePrimaryEmail } from "@/lib/onboarding-signer";

const KNOWN_EMAIL_TYPO_DOMAINS = new Set([
  "gmial.com",
  "gmal.com",
  "gamil.com",
  "gnail.com",
  "gmail.co",
  "gmail.con",
  "yaho.com",
  "hotmial.com",
]);

export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function validateCohortEmail(email: string): { valid: boolean; reason: string | null } {
  const normalized = normalizePrimaryEmail(email);
  if (!normalized) {
    return { valid: false, reason: "Missing or malformed email." };
  }
  const domain = normalized.split("@")[1] ?? "";
  if (KNOWN_EMAIL_TYPO_DOMAINS.has(domain)) {
    return { valid: false, reason: `Likely typo domain: ${domain}` };
  }
  return { valid: true, reason: null };
}

export function validateCohortPhone(phone: string): { valid: boolean; reason: string | null } {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return { valid: false, reason: "Missing phone number." };
  if (digits.length !== 10) {
    return { valid: false, reason: `Expected 10-digit US phone, got ${digits.length} digits.` };
  }
  return { valid: true, reason: null };
}
