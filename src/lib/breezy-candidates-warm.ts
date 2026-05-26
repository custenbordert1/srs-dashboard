import { getLastOkTabCandidatesSnapshot, peekTabCandidatesCache } from "@/lib/breezy-candidates-client";
import { BREEZY_CANDIDATES_SOURCE } from "@/lib/breezy-candidates-sync";

let warmInflight: Promise<void> | null = null;

function hasWarmCandidatesData(): boolean {
  if ((getLastOkTabCandidatesSnapshot()?.candidates.length ?? 0) > 0) return true;
  const cached = peekTabCandidatesCache();
  return (cached?.ok && cached.candidates.length > 0) === true;
}

/**
 * Non-blocking fast-tier prefetch when the recruiting dashboard mounts.
 * Skips work when server or tab memory already holds an ok snapshot.
 */
export function warmBreezyCandidatesCache(): void {
  if (typeof window === "undefined") return;
  if (hasWarmCandidatesData()) return;
  if (warmInflight) return;

  warmInflight = fetch(`${BREEZY_CANDIDATES_SOURCE.apiPath}?scan=fast`, {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      warmInflight = null;
    });
}
