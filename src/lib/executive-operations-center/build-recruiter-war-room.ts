import type { RecruiterWorkloadRow } from "@/lib/territory-action-engine/types";
import type {
  ExecutiveRecruiterWarRoomRow,
  RecruiterWarRoomStatus,
} from "@/lib/executive-operations-center/types";

function warRoomStatus(row: RecruiterWorkloadRow): RecruiterWarRoomStatus {
  if (row.overloadLevel === "overloaded") return "reassign";
  if (row.overloadLevel === "elevated") return "needs-help";
  return "balanced";
}

function recommendation(status: RecruiterWarRoomStatus, row: RecruiterWorkloadRow): string {
  switch (status) {
    case "reassign":
      return row.recommendedRedistribution;
    case "needs-help":
      return "Provide backup coverage for follow-ups and paperwork";
    default:
      return "Capacity available for new assignments";
  }
}

export function buildRecruiterWarRoomRows(
  workloads: RecruiterWorkloadRow[],
): ExecutiveRecruiterWarRoomRow[] {
  return workloads
    .map((row) => {
      const status = warRoomStatus(row);
      return {
        recruiterName: row.recruiterName,
        assignedCandidates: row.assignedCount,
        followUpsDue: row.followUpsDue,
        paperwork: row.paperworkPending,
        readyForMel: row.readyForMel,
        workloadScore: row.workloadScore,
        status,
        recommendation: recommendation(status, row),
      };
    })
    .sort((a, b) => b.workloadScore - a.workloadScore);
}
