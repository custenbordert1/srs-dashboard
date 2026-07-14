import { decideOwnershipWrite } from "@/lib/p188-4-recruiter-ownership-durability/precedence";
import { mergeOwnershipSticky } from "@/lib/p188-4-recruiter-ownership-durability/ownershipMerge";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function stub(
  partial: Partial<CandidateWorkflowRecord> & { candidateId: string },
): CandidateWorkflowRecord {
  return {
    workflowStatus: "Applied",
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    updatedAt: "2026-07-10T00:00:00.000Z",
    lastActionAt: null,
    paperworkStatus: "not_sent",
    recruiterAssignmentSource: null,
    recruiterOwnershipVersion: 0,
    ...partial,
  } as CandidateWorkflowRecord;
}

/**
 * In-memory durability simulation (no production writes).
 */
export function simulateOwnershipDurability(): {
  assignmentsPreserved: number;
  clobbersPrevented: number;
  conflictsSurfaced: number;
  scenarios: Array<{ name: string; ok: boolean; detail: string }>;
} {
  const scenarios: Array<{ name: string; ok: boolean; detail: string }> = [];
  let assignmentsPreserved = 0;
  let clobbersPrevented = 0;
  let conflictsSurfaced = 0;

  // named preservation vs Unassigned import
  {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Unassigned",
      incomingSource: "unassigned",
      existingRecruiter: "Taylor",
      existingSource: "auto",
    });
    const ok = d.recruiter === "Taylor" && d.blocked;
    if (ok) {
      assignmentsPreserved += 1;
      clobbersPrevented += 1;
    }
    scenarios.push({
      name: "Unassigned import after named assignment",
      ok,
      detail: d.reason,
    });
  }

  // null overwrite
  {
    const d = decideOwnershipWrite({
      incomingRecruiter: null,
      existingRecruiter: "Alex",
      existingSource: "manual",
    });
    const ok = d.recruiter === "Alex";
    if (ok) clobbersPrevented += 1;
    scenarios.push({ name: "null cannot overwrite named", ok, detail: d.reason });
  }

  // lower priority cannot overwrite
  {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Riley",
      incomingSource: "auto",
      existingRecruiter: "Taylor",
      existingSource: "manual",
    });
    const ok = d.recruiter === "Taylor" && d.blocked;
    if (ok) {
      assignmentsPreserved += 1;
      clobbersPrevented += 1;
    }
    scenarios.push({
      name: "auto cannot overwrite manual",
      ok,
      detail: d.reason,
    });
  }

  // explicit reassignment
  {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Jordan",
      incomingSource: "manual",
      existingRecruiter: "Taylor",
      existingSource: "auto",
      allowForceOverwrite: true,
    });
    scenarios.push({
      name: "explicit reassignment works",
      ok: d.applied && d.recruiter === "Jordan",
      detail: d.reason,
    });
  }

  // concurrent merge
  {
    const disk = stub({
      candidateId: "c1",
      assignedRecruiter: "Morgan",
      recruiterAssignmentSource: "auto",
      recruiterOwnershipVersion: 2,
    });
    const incoming = stub({
      candidateId: "c1",
      assignedRecruiter: "Unassigned",
      workflowStatus: "Applied",
      recruiterOwnershipVersion: 0,
    });
    const merged = mergeOwnershipSticky(disk, incoming);
    const ok = merged.assignedRecruiter === "Morgan";
    if (ok) clobbersPrevented += 1;
    scenarios.push({
      name: "concurrent ingestion/assignment race merge",
      ok,
      detail: `merged=${merged.assignedRecruiter}`,
    });
  }

  // equal priority conflict
  {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Alex",
      incomingSource: "auto",
      existingRecruiter: "Taylor",
      existingSource: "auto",
    });
    const ok = d.conflictClass === "conflicting_history";
    if (ok) conflictsSurfaced += 1;
    scenarios.push({
      name: "conflicting historical assignments",
      ok,
      detail: d.reason,
    });
  }

  // operator restore sticky
  {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Unassigned",
      incomingSource: "unassigned",
      existingRecruiter: "Casey",
      existingSource: "operator_restore",
    });
    const ok = d.recruiter === "Casey";
    if (ok) assignmentsPreserved += 1;
    scenarios.push({
      name: "operator-confirmed restore sticky",
      ok,
      detail: d.reason,
    });
  }

  // manual sticky
  {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Drew",
      incomingSource: "breezy_import",
      existingRecruiter: "Sam",
      existingSource: "manual",
    });
    const ok = d.recruiter === "Sam";
    if (ok) assignmentsPreserved += 1;
    scenarios.push({ name: "manual assignment sticky", ok, detail: d.reason });
  }

  return {
    assignmentsPreserved,
    clobbersPrevented,
    conflictsSurfaced,
    scenarios,
  };
}
