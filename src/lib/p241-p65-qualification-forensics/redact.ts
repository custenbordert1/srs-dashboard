import { createHash } from "node:crypto";

export function p241Sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function p241RedactId(candidateId: string): string {
  return p241Sha256(candidateId).slice(0, 12);
}

export function p241DisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  candidateId: string;
}): string {
  const name = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  return name || input.email?.trim() || input.candidateId;
}
