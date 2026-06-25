/** Structured Breezy candidates fetch logging for server routes and client tab sync. */

export type BreezyCandidatesOpsOutcome =
  | "request_start"
  | "success"
  | "empty"
  | "timeout"
  | "error"
  | "fallback";

export function isBreezyCandidatesTimeoutMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("timeout") || lower.includes("timed out");
}

export function logBreezyCandidatesOps(
  side: "server" | "client",
  outcome: BreezyCandidatesOpsOutcome,
  meta?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  if (meta && Object.keys(meta).length > 0) {
    console.info(`[breezy-candidates-ops] ${side}:${outcome}`, meta);
    return;
  }
  console.info(`[breezy-candidates-ops] ${side}:${outcome}`);
}

/** Server-side Breezy per-position extraction diagnostics (dev only). */
export function logBreezyCandidatesExtract(
  stage: string,
  meta: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[breezy-candidates-extract] ${stage}`, meta);
}
