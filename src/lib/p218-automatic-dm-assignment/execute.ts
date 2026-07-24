import { assertP218LiveAuthorized } from "@/lib/p218-automatic-dm-assignment/authorization";
import type {
  P218AssignmentDecision,
  P218ModeAuthorization,
} from "@/lib/p218-automatic-dm-assignment/types";

export type P218DmPersister = (input: {
  candidateId: string;
  expectedDm: string;
  approvedBy: string;
  positionId: string;
  territory: string;
}) => Promise<{
  assigned: boolean;
  reason: "assigned" | "workflow_missing" | "already_assigned" | "invalid_expected_dm";
}>;

export async function executeP218Assignments(input: {
  decisions: P218AssignmentDecision[];
  authorization: P218ModeAuthorization;
  persist?: P218DmPersister;
}): Promise<P218AssignmentDecision[]> {
  if (input.authorization.mode === "preview") return input.decisions;
  assertP218LiveAuthorized(input.authorization);
  if (!input.persist) throw new Error("P218 live mode requires a DM persistence adapter");

  const approvedBy = input.authorization.approvedBy!;
  const results: P218AssignmentDecision[] = [];
  for (const decision of input.decisions) {
    if (
      decision.action !== "would_assign" ||
      !decision.expectedAssignedDm ||
      !decision.positionId ||
      !decision.territory
    ) {
      results.push(decision);
      continue;
    }
    const persisted = await input.persist({
      candidateId: decision.candidateId,
      expectedDm: decision.expectedAssignedDm,
      approvedBy,
      positionId: decision.positionId,
      territory: decision.territory,
    });
    if (persisted.assigned) {
      results.push({ ...decision, action: "assigned" });
    } else {
      results.push({
        ...decision,
        action: "skipped_race",
        reason: "concurrent_assignment_detected",
      });
    }
  }
  return results;
}
