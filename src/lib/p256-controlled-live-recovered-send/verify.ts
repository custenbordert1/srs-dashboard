import { verifyP253Integrity } from "@/lib/p253-controlled-live-paperwork-send/verify";
import type { P256IntegrityCheck } from "@/lib/p256-controlled-live-recovered-send/types";

export async function verifyP256Integrity(input: {
  createdRequestIds: Array<{ candidateId: string; signatureRequestId: string }>;
}): Promise<P256IntegrityCheck> {
  return verifyP253Integrity(input);
}
