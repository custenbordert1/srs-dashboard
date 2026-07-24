import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { HiringWorkspaceApplicantRow } from "@/lib/p258-hiring-workspace";
import type { CandidateOpsQuickFilterId } from "@/lib/p259-candidate-operations/types";

function isUnassignedDm(name: string): boolean {
  const raw = name.trim();
  return !raw || raw.toLowerCase() === "unassigned";
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function hasEmail(email: string): boolean {
  const value = email.trim();
  return value.includes("@") && value.includes(".");
}

export const CANDIDATE_OPS_QUICK_FILTERS: Array<{
  id: CandidateOpsQuickFilterId;
  label: string;
}> = [
  { id: "only_ready", label: "Only Ready" },
  { id: "needs_recruiter", label: "Needs Recruiter" },
  { id: "needs_dm", label: "Needs DM" },
  { id: "needs_paperwork", label: "Needs Paperwork" },
  { id: "viewed", label: "Viewed" },
  { id: "signed", label: "Signed" },
  { id: "distance_gt_40", label: "Distance >40" },
  { id: "distance_lt_20", label: "Distance <20" },
  { id: "missing_phone", label: "Missing Phone" },
  { id: "missing_email", label: "Missing Email" },
  { id: "incomplete_identity", label: "Incomplete Identity" },
];

export function matchesQuickFilter(
  row: HiringWorkspaceApplicantRow,
  filter: CandidateOpsQuickFilterId,
): boolean {
  switch (filter) {
    case "only_ready":
      return row.readyForPaperwork;
    case "needs_recruiter":
      return isUnassignedRecruiter(row.recruiter);
    case "needs_dm":
      return isUnassignedDm(row.dm);
    case "needs_paperwork":
      return (
        row.workflowStatus === "Paperwork Needed" ||
        (row.paperworkStatus === "not_sent" &&
          (row.workflowStatus === "Qualified" ||
            row.workflowStatus === "Operator Approved" ||
            row.readyForPaperwork))
      );
    case "viewed":
      return row.paperworkStatus === "viewed" || Boolean(row.paperworkViewedAt);
    case "signed":
      return row.paperworkStatus === "signed" || row.workflowStatus === "Signed";
    case "distance_gt_40":
      return row.distanceMiles != null && row.distanceMiles > 40;
    case "distance_lt_20":
      return row.distanceMiles != null && row.distanceMiles < 20;
    case "missing_phone":
      return phoneDigits(row.phone).length < 10;
    case "missing_email":
      return !hasEmail(row.email);
    case "incomplete_identity":
      return !(row.firstName.trim() && row.lastName.trim());
    default:
      return true;
  }
}

/**
 * Apply quick filters (AND). Empty set returns all rows.
 */
export function filterApplicantsByQuickFilters<T extends HiringWorkspaceApplicantRow>(
  applicants: T[],
  filters: readonly CandidateOpsQuickFilterId[],
): T[] {
  if (!filters.length) return applicants;
  return applicants.filter((row) => filters.every((filter) => matchesQuickFilter(row, filter)));
}

export function toggleQuickFilter(
  current: readonly CandidateOpsQuickFilterId[],
  filter: CandidateOpsQuickFilterId,
): CandidateOpsQuickFilterId[] {
  if (current.includes(filter)) return current.filter((id) => id !== filter);
  return [...current, filter];
}
