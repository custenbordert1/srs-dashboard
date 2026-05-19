import type { BreezyApiFailure } from "@/lib/breezy-api";

export function breezyFailureHttpStatus(error: string): number {
  if (error.includes("Breezy API key") || error.includes("Waiting on Breezy")) {
    return 503;
  }
  return 502;
}

export function breezyFailureBody(result: BreezyApiFailure): { ok: false; error: string } {
  return { ok: false, error: result.error };
}
