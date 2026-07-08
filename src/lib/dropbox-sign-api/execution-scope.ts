import type { DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import { recordDropboxExecutionScopeDedupe } from "@/lib/dropbox-sign-api/metrics";

type ExecutionScope = {
  fetchedById: Map<string, DropboxSignRequestSummary>;
};

let activeScope: ExecutionScope | null = null;

export function beginDropboxSignExecutionScope(): void {
  activeScope = { fetchedById: new Map() };
}

export function endDropboxSignExecutionScope(): void {
  activeScope = null;
}

export function getExecutionScopeSignature(
  signatureRequestId: string,
): DropboxSignRequestSummary | null {
  const hit = activeScope?.fetchedById.get(signatureRequestId) ?? null;
  if (hit) recordDropboxExecutionScopeDedupe();
  return hit;
}

export function rememberExecutionScopeSignature(summary: DropboxSignRequestSummary): void {
  if (!activeScope || !summary.signatureRequestId) return;
  activeScope.fetchedById.set(summary.signatureRequestId, summary);
}
