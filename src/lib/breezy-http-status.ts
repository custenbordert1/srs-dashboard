import type { BreezyApiFailure } from "@/lib/breezy-api";
import { classifyBreezyError } from "@/lib/env-validation";

export function breezyFailureHttpStatus(error: string): number {
  if (classifyBreezyError(error) === "missing_config") {
    return 503;
  }
  return 502;
}

export function breezyFailureBody(result: BreezyApiFailure): { ok: false; error: string } {
  return { ok: false, error: result.error };
}
