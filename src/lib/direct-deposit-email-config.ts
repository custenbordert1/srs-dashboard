import { DIRECT_DEPOSIT_HR_EMAIL } from "@/lib/direct-deposit-types";

/** Optional HR visibility copy when DD verification is sent (DIRECT_DEPOSIT_BCC). */
export function getDirectDepositBccAddress(): string | null {
  const raw = process.env.DIRECT_DEPOSIT_BCC?.trim();
  if (!raw) return null;
  return raw;
}

export function getDirectDepositHrCopyConfig(): {
  configured: boolean;
  address: string | null;
} {
  const address = getDirectDepositBccAddress();
  return {
    configured: Boolean(address),
    address,
  };
}

/** Default HR from/reply when env overrides are unset. */
export function getDirectDepositHrFromAddress(): string {
  return process.env.DIRECT_DEPOSIT_FROM?.trim() || DIRECT_DEPOSIT_HR_EMAIL;
}

export function getDirectDepositHrReplyToAddress(): string {
  return process.env.DIRECT_DEPOSIT_REPLY_TO?.trim() || DIRECT_DEPOSIT_HR_EMAIL;
}
