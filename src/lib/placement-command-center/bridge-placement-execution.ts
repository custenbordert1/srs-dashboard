import { executeHiringCorrelation } from "@/lib/autonomous-recruiting-execution/bridge-hiring";
import { getCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import { recordPlacementOutcome } from "@/lib/placement-command-center/bridge-p61-accountability";

export type ExecutePlacementResult = Awaited<ReturnType<typeof executeHiringCorrelation>>;

/** P61 bridge — delegates placement execution to P58 hiring orchestration only. */
export async function executePlacementCorrelation(
  correlationId: string,
  actor?: string,
): Promise<ExecutePlacementResult> {
  const correlation = await getCorrelation(correlationId);
  if (!correlation) return { ok: false, error: "Correlation not found." };
  if (correlation.type !== "placement") {
    return { ok: false, error: "Correlation is not a placement recommendation.", correlation };
  }

  const result = await executeHiringCorrelation(correlationId, actor);

  if (correlation.accountabilityActionId) {
    await recordPlacementOutcome(
      correlation.accountabilityActionId,
      result.ok ? result.summary : (result.error ?? "Placement execution failed."),
      result.ok,
      { displayName: actor ?? "P61 Placement Bridge" },
    );
  }

  return result;
}
