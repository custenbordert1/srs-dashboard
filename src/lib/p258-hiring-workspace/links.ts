export function buildBreezyCandidateDeepLink(input: {
  companyId?: string | null;
  positionId?: string | null;
  candidateId: string;
}): string | null {
  const companyId = input.companyId?.trim();
  const positionId = input.positionId?.trim();
  if (!companyId || !positionId || !input.candidateId.trim()) return null;
  return `https://app.breezy.hr/app/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(positionId)}/candidates/${encodeURIComponent(input.candidateId)}`;
}

export function buildDropboxSignManageLink(signatureRequestId?: string | null): string | null {
  const id = signatureRequestId?.trim();
  if (!id) return null;
  return `https://app.hellosign.com/home/manage?guid=${encodeURIComponent(id)}`;
}

export function buildMailtoLink(email?: string | null): string | null {
  const value = email?.trim();
  if (!value || !value.includes("@")) return null;
  return `mailto:${value}`;
}

export async function copyTextToClipboard(value: string): Promise<boolean> {
  const text = value.trim();
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}
