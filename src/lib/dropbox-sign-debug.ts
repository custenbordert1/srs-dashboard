/** Temporary Dropbox Sign diagnostics — remove after send flow is stable. */

export function logDropboxSignDebug(stage: string, payload: Record<string, unknown>): void {
  console.info(`[dropbox-sign-debug] ${stage}`, payload);
}

export function candidatePayloadKeys(body: Record<string, unknown>): string[] {
  return Object.keys(body).sort();
}

export function signersHaveBlankEmail(
  signers: Array<{ emailAddress?: string; email_address?: string }>,
): boolean {
  return signers.some((signer) => {
    const email = (signer.emailAddress ?? signer.email_address ?? "").trim();
    return !email;
  });
}

export function signerRoleMatchesEnv(role: string): {
  dropboxSignSignerRoleEnv: string | null;
  roleMatchesDropboxSignSignerRole: boolean | null;
} {
  const envRole = process.env.DROPBOX_SIGN_SIGNER_ROLE?.trim() ?? "";
  if (!envRole) {
    return { dropboxSignSignerRoleEnv: null, roleMatchesDropboxSignSignerRole: null };
  }
  return {
    dropboxSignSignerRoleEnv: envRole,
    roleMatchesDropboxSignSignerRole: role.trim() === envRole,
  };
}
