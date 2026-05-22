import { peekBreezyCandidatesCache } from "@/lib/breezy-api";
import { getLastOkTabCandidatesSnapshot } from "@/lib/breezy-candidates-client";
import { BREEZY_CANDIDATES_SOURCE } from "@/lib/breezy-candidates-sync";

let warmInflight: Promise<void> | null = null;

function hasWarmCandidatesData(): boolean {
  if (getLastOkTabCandidatesSnapshot()) return true;
  const preview = peekBreezyCandidatesCache({ scanMode: "preview" });
  if (preview?.ok) return true;
  const peeked = peekBreezyCandidatesCache({ scanMode: "fast" });
  if (peeked?.ok) return true;
  const merged = peekBreezyCandidatesCache({ scanMode: "all" });
  return merged?.ok === true;
}

/**
 * Non-blocking fast-tier prefetch when the recruiting dashboard mounts.
 * Skips work when server or tab memory already holds an ok snapshot.
 */
export function warmBreezyCandidatesCache(): void {
  if (typeof window === "undefined") return;
  if (hasWarmCandidatesData()) return;
  if (warmInflight) return;

  warmInflight = fetch(`${BREEZY_CANDIDATES_SOURCE.apiPath}?scan=preview`, {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      warmInflight = null;
    });
}
