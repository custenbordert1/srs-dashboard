export const FORCE_AUTO_ADVANCE_WARNING =
  "FORCE AUTO-ADVANCE OVERRIDE ENABLED - HUMAN REVIEW BYPASSED";

/**
 * `--force-auto-advance` is only legal with live execute + confirmLive.
 * Throws a clear Error when the combination is unsafe / incomplete.
 */
export function assertForceAutoAdvanceAllowed(input: {
  forceAutoAdvance: boolean;
  dryRun: boolean;
  confirmLive: boolean;
}): void {
  if (!input.forceAutoAdvance) return;
  if (input.dryRun || !input.confirmLive) {
    throw new Error(
      "--force-auto-advance requires --live --confirm-live (refusing to start). " +
        "This override bypasses P204 human_review and must not run in dry-run.",
    );
  }
}
