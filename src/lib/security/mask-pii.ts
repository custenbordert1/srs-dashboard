import type { BreezyCandidate } from "@/lib/breezy-api";
import type { UserRole } from "@/lib/auth/types";

function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 1) return "***@***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const maskedLocal = `${local.slice(0, 1)}***`;
  const dot = domain.lastIndexOf(".");
  if (dot <= 0) return `${maskedLocal}@***`;
  return `${maskedLocal}@${domain.slice(0, 1)}***${domain.slice(dot)}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***-***-${digits.slice(-4)}`;
}

export function shouldMaskPii(role: UserRole | "anonymous"): boolean {
  return role !== "executive";
}

export function maskCandidatePii<T extends Pick<BreezyCandidate, "email" | "phone">>(
  candidate: T,
  role: UserRole | "anonymous",
): T {
  if (!shouldMaskPii(role)) return candidate;
  return {
    ...candidate,
    email: candidate.email ? maskEmail(candidate.email) : candidate.email,
    phone: candidate.phone ? maskPhone(candidate.phone) : candidate.phone,
  };
}

export function maskEmailValue(email: string, role: UserRole | "anonymous"): string {
  return shouldMaskPii(role) ? maskEmail(email) : email;
}

export function maskPhoneValue(phone: string, role: UserRole | "anonymous"): string {
  return shouldMaskPii(role) ? maskPhone(phone) : phone;
}
