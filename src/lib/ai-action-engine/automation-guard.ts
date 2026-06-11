/** P14 actions require explicit user confirmation — no silent automation. */
export const AI_ACTION_ENGINE_ALLOWS_AUTOMATION = false;

export function assertManualConfirmationRequired(confirmed: boolean): void {
  if (AI_ACTION_ENGINE_ALLOWS_AUTOMATION) return;
  if (!confirmed) {
    throw new Error("Action requires confirmed: true");
  }
}
