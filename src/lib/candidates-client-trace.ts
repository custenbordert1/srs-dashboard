/** Temporary client hydration/render tracing — remove when tab sync is stable. */

export function logCandidatesClientTrace(
  stage: string,
  meta?: Record<string, unknown>,
): void {
  if (meta && Object.keys(meta).length > 0) {
    console.info(`[candidates-client-trace] ${stage}`, meta);
    return;
  }
  console.info(`[candidates-client-trace] ${stage}`);
}
