import { P193_2_MIN_COHORT, type P1932FrozenCohort } from "@/lib/p193-2-simplified-lifecycle-pilot/types";

export function validateP1932PilotGuards(input: {
  cohort: P1932FrozenCohort;
  bridgedIds: string[];
  workflowsTouchedOutsideCohort: string[];
  reminderSendEnabled: boolean;
  melWrites: number;
  autoAssignments: number;
  belowMinimumAborted: boolean;
}): { ok: boolean; checks: Array<{ id: string; pass: boolean; detail: string }> } {
  const checks = [
    {
      id: "cohort_immutable",
      pass: input.cohort.immutable === true,
      detail: `immutable=${input.cohort.immutable}`,
    },
    {
      id: "cohort_size_cap",
      pass: input.cohort.members.length <= 10,
      detail: `size=${input.cohort.members.length}`,
    },
    {
      id: "min_cohort_gate",
      pass: input.belowMinimumAborted || input.cohort.members.length >= P193_2_MIN_COHORT,
      detail: input.belowMinimumAborted
        ? `aborted_below_minimum size=${input.cohort.members.length}`
        : `size=${input.cohort.members.length}`,
    },
    {
      id: "no_outside_cohort_writes",
      pass: input.workflowsTouchedOutsideCohort.length === 0,
      detail: `outside=${input.workflowsTouchedOutsideCohort.length}`,
    },
    {
      id: "reminder_send_off",
      pass: input.reminderSendEnabled === false,
      detail: "reminder sending disabled",
    },
    {
      id: "no_mel_writes",
      pass: input.melWrites === 0,
      detail: `melWrites=${input.melWrites}`,
    },
    {
      id: "no_auto_assignment",
      pass: input.autoAssignments === 0,
      detail: `autoAssignments=${input.autoAssignments}`,
    },
    {
      id: "bridge_subset_of_cohort",
      pass: input.bridgedIds.every((id) => input.cohort.members.some((m) => m.candidateId === id)),
      detail: `bridged=${input.bridgedIds.length}`,
    },
  ];
  return { ok: checks.every((c) => c.pass), checks };
}
