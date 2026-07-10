import type { DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import {
  DROPBOX_CACHE_TTL_AWAITING_MS,
  DROPBOX_CACHE_TTL_SIGNED_MS,
  DROPBOX_CACHE_TTL_VIEWED_MS,
} from "@/lib/dropbox-sign-api/constants";
import { recordDropboxCacheHit, recordDropboxCacheMiss } from "@/lib/dropbox-sign-api/metrics";

type CacheEntry = {
  summary: DropboxSignRequestSummary;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function ttlForSummary(summary: DropboxSignRequestSummary): number {
  if (summary.isComplete) return DROPBOX_CACHE_TTL_SIGNED_MS;
  if (summary.signatures.some((s) => s.lastViewedAt)) return DROPBOX_CACHE_TTL_VIEWED_MS;
  return DROPBOX_CACHE_TTL_AWAITING_MS;
}

export function getCachedSignatureRequest(
  signatureRequestId: string,
): DropboxSignRequestSummary | null {
  const entry = cache.get(signatureRequestId);
  if (!entry) {
    recordDropboxCacheMiss();
    return null;
  }
  if (Date.now() >= entry.expiresAt) {
    cache.delete(signatureRequestId);
    recordDropboxCacheMiss();
    return null;
  }
  recordDropboxCacheHit();
  return entry.summary;
}

export function setCachedSignatureRequest(summary: DropboxSignRequestSummary): void {
  if (!summary.signatureRequestId) return;
  cache.set(summary.signatureRequestId, {
    summary,
    expiresAt: Date.now() + ttlForSummary(summary),
  });
}

export function invalidateCachedSignatureRequest(signatureRequestId: string): void {
  cache.delete(signatureRequestId);
}

export function clearSignatureRequestCache(): void {
  cache.clear();
}
