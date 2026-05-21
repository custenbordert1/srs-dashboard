export type BreezyFailureKind = "missing_config" | "api_failure";

export function classifyBreezyError(error: string): BreezyFailureKind {
  const normalized = error.toLowerCase();
  if (
    normalized.includes("missing breezy api key") ||
    normalized.includes("breezy api key is not configured") ||
    normalized.includes("not configured") ||
    normalized.includes("waiting on breezy") ||
    normalized.includes("set breezy_api_key") ||
    normalized.includes(".env.local") ||
    normalized.includes("http 503")
  ) {
    return "missing_config";
  }
  return "api_failure";
}

export function breezyDisconnectedTitle(kind: BreezyFailureKind): string {
  return kind === "missing_config" ? "Missing Breezy API key" : "Breezy disconnected";
}

export function breezyDisconnectedDetail(error: string, kind: BreezyFailureKind): string {
  if (kind === "missing_config") {
    if (error.toLowerCase().includes("missing breezy api key")) return error;
    return "Add BREEZY_API_KEY to .env.local (paste from your old Mac), then restart npm run dev.";
  }
  return error || "Unable to reach the Breezy API. Check your network and API key, then try again.";
}
