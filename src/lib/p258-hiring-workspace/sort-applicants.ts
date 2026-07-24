import {
  computeHiringScore,
  isReadyForPaperwork,
} from "@/lib/p258-hiring-workspace/hiring-score";
import type { HiringWorkspaceApplicantRow } from "@/lib/p258-hiring-workspace/types";

/**
 * Sort: 1) Ready for Paperwork 2) Highest Hiring Score 3) Most recent applicant.
 */
export function compareHiringWorkspaceApplicants(
  a: Pick<HiringWorkspaceApplicantRow, "readyForPaperwork" | "hiringScore" | "appliedDate">,
  b: Pick<HiringWorkspaceApplicantRow, "readyForPaperwork" | "hiringScore" | "appliedDate">,
): number {
  if (a.readyForPaperwork !== b.readyForPaperwork) {
    return a.readyForPaperwork ? -1 : 1;
  }
  if (a.hiringScore !== b.hiringScore) {
    return b.hiringScore - a.hiringScore;
  }
  const aTime = a.appliedDate ? new Date(a.appliedDate).getTime() : 0;
  const bTime = b.appliedDate ? new Date(b.appliedDate).getTime() : 0;
  const aSafe = Number.isFinite(aTime) ? aTime : 0;
  const bSafe = Number.isFinite(bTime) ? bTime : 0;
  return bSafe - aSafe;
}

export function sortHiringWorkspaceApplicants<
  T extends Pick<HiringWorkspaceApplicantRow, "readyForPaperwork" | "hiringScore" | "appliedDate">,
>(rows: T[]): T[] {
  return [...rows].sort(compareHiringWorkspaceApplicants);
}

/** Helper for tests / callers that only have raw score inputs. */
export function sortByHiringWorkspaceRules<
  T extends {
    appliedDate?: string;
    workflowStatus: HiringWorkspaceApplicantRow["workflowStatus"];
    actionType?: string | null;
    distanceMiles?: number | null;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    assignedRecruiter?: string;
    assignedDM?: string;
    paperworkStatus?: HiringWorkspaceApplicantRow["paperworkStatus"];
    signatureRequestId?: string | null;
  },
>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const aReady = isReadyForPaperwork(left);
    const bReady = isReadyForPaperwork(right);
    const aScore = computeHiringScore(left as never).score;
    const bScore = computeHiringScore(right as never).score;
    return compareHiringWorkspaceApplicants(
      {
        readyForPaperwork: aReady,
        hiringScore: aScore,
        appliedDate: left.appliedDate ?? "",
      },
      {
        readyForPaperwork: bReady,
        hiringScore: bScore,
        appliedDate: right.appliedDate ?? "",
      },
    );
  });
}
