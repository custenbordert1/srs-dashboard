import { invalidateCached } from "@/lib/client-api-cache";
import { P223_WORKFLOW_CACHE_KEY_PREFIX } from "@/lib/p223-recruiter-inbox-restoration/union";

/**
 * Bust the client workflow overlay cache so durable store writes (including
 * restored list membership) are visible without waiting for the 120s TTL.
 * Does not introduce new polling — callers invoke on focus / mutation / SSE.
 */
export function invalidateP223WorkflowClientCache(): void {
  invalidateCached(P223_WORKFLOW_CACHE_KEY_PREFIX);
  invalidateCached("candidates:workflows");
}
