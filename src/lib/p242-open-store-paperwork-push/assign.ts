import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import {
  P242_PHASE,
  P242_TAYLOR,
  type P242AssignmentAuditRow,
  type P242CandidateMatch,
} from "@/lib/p242-open-store-paperwork-push/types";

function isUnassignedDm(name: string): boolean {
  const v = name.trim().toLowerCase();
  return !v || v === "unassigned";
}

/**
 * Assign Taylor as recruiter when required for send path, and DM from
 * authoritative open-store district manager when currently unassigned.
 * Does not modify candidates outside the eligible cohort.
 */
export async function assignP242Ownership(input: {
  eligible: P242CandidateMatch[];
  persist: boolean;
  assignTaylor?: boolean;
  assignDm?: boolean;
}): Promise<{ audits: P242AssignmentAuditRow[]; notes: string[] }> {
  const assignTaylor = input.assignTaylor !== false;
  const assignDm = input.assignDm !== false;
  const audits: P242AssignmentAuditRow[] = [];
  const notes: string[] = [];
  const workflows = await getCandidateWorkflowState();

  for (const c of input.eligible) {
    const before = workflows[c.candidateId];
    const beforeRecruiter = String(before?.assignedRecruiter ?? c.assignedRecruiter ?? "Unassigned");
    const beforeDm = String(before?.assignedDM ?? c.assignedDM ?? "Unassigned");

    // Assign Taylor only when missing / placeholder ownership — do not steal
    // unrelated recruiters (Morgan/Alex/Riley/etc.).
    const needsTaylor =
      assignTaylor &&
      (isUnassignedRecruiter(beforeRecruiter) ||
        /^recruiting team$/i.test(beforeRecruiter));

    const nextRecruiter = needsTaylor ? P242_TAYLOR : beforeRecruiter;

    const expectedDm = c.districtManager?.trim() || "";
    const needsDm =
      assignDm &&
      expectedDm &&
      !/^unassigned$/i.test(expectedDm) &&
      isUnassignedDm(beforeDm);

    const nextDm = needsDm ? expectedDm : beforeDm;

    if (nextRecruiter === beforeRecruiter && nextDm === beforeDm) {
      continue;
    }

    if (input.persist) {
      await upsertCandidateWorkflow({
        candidateId: c.candidateId,
        ...(nextRecruiter !== beforeRecruiter
          ? {
              assignedRecruiter: nextRecruiter,
              recruiterAssignmentSource: "auto" as const,
              recruiterAssignmentReason: `${P242_PHASE}: urgent open-store paperwork push`,
            }
          : {}),
        ...(nextDm !== beforeDm
          ? {
              assignedDM: nextDm,
            }
          : {}),
        audit: {
          action: "p242_open_store_ownership_assign",
          byUserId: "Taylor Custenborder",
          metadata: {
            phase: P242_PHASE,
            storeLabel: c.storeLabel,
            previousRecruiter: beforeRecruiter,
            previousDm: beforeDm,
          },
        },
      });
    }

    if (nextRecruiter !== beforeRecruiter) {
      audits.push({
        candidateId: c.candidateId,
        name: c.name,
        field: "assignedRecruiter",
        before: beforeRecruiter,
        after: nextRecruiter,
        applied: input.persist,
        reason: "P242 urgent send path requires Taylor ownership",
      });
    }
    if (nextDm !== beforeDm) {
      audits.push({
        candidateId: c.candidateId,
        name: c.name,
        field: "assignedDM",
        before: beforeDm,
        after: nextDm,
        applied: input.persist,
        reason: `Authoritative open-store DM from workbook (${c.storeLabel})`,
      });
    }
  }

  notes.push(
    `Ownership audits: ${audits.length} field change(s); persist=${input.persist}.`,
  );
  return { audits, notes };
}
