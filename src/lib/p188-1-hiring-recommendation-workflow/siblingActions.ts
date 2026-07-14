import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { readP1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";
import type { P1881AllowedRole } from "@/lib/p188-1-hiring-recommendation-workflow/types";

/**
 * Sibling authorized workflow actions — existing production upsert paths only.
 * Never sends paperwork / never MEL / never auto-approves.
 */
export async function executeSiblingWorkflowAction(input: {
  action: "return_for_more_review" | "mark_not_qualified" | "place_on_hold";
  candidateId: string;
  actor: string;
  role: P1881AllowedRole;
  note?: string;
  forceFlags?: { recommendationApi: boolean };
  upsert?: typeof upsertCandidateWorkflow;
}): Promise<{ ok: boolean; detail: string; paperworkSendsAttempted: 0 }> {
  const flags = readP1881Flags(
    input.forceFlags ? { recommendationApi: input.forceFlags.recommendationApi } : undefined,
  );
  if (!flags.recommendationApi) {
    return {
      ok: false,
      detail: "P188_RECOMMENDATION_API flag is off",
      paperworkSendsAttempted: 0,
    };
  }

  const upsert = input.upsert ?? upsertCandidateWorkflow;
  const note =
    input.note?.trim() ||
    ({
      return_for_more_review: "Returned for more review",
      mark_not_qualified: "Marked Not Qualified",
      place_on_hold: "[HOLD] Placed on hold",
    } as const)[input.action];

  if (input.action === "return_for_more_review") {
    await upsert({
      candidateId: input.candidateId,
      workflowStatus: "Needs Review",
      forceWorkflowStatus: true,
      note,
      audit: {
        action: "p1881_return_for_more_review",
        byUserId: input.actor,
        metadata: { role: input.role },
      },
    });
  } else if (input.action === "mark_not_qualified") {
    await upsert({
      candidateId: input.candidateId,
      workflowStatus: "Not Qualified",
      forceWorkflowStatus: true,
      note,
      audit: {
        action: "p1881_mark_not_qualified",
        byUserId: input.actor,
        metadata: { role: input.role },
      },
    });
  } else {
    await upsert({
      candidateId: input.candidateId,
      note,
      audit: {
        action: "p1881_place_on_hold",
        byUserId: input.actor,
        metadata: { role: input.role },
      },
    });
  }

  return { ok: true, detail: `Applied ${input.action}`, paperworkSendsAttempted: 0 };
}
