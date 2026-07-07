import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { P155QueueHealthSection } from "@/lib/p155-autopilot-operations-dashboard/types";

function todayStartMs(): number {
  return Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export async function buildQueueHealthFromWorkflow(): Promise<P155QueueHealthSection> {
  const bundle = await getCandidateWorkflowBundle();
  const todayStart = todayStartMs();
  let eligibleForPaperwork = 0;
  let waitingOnSignature = 0;
  let signedToday = 0;
  let needsRecruiterAssignment = 0;
  let disqualifiedArchived = 0;
  let queueRemaining = 0;

  for (const record of Object.values(bundle.workflows)) {
    if (
      record.paperworkStatus === "signed" &&
      record.paperworkSignedAt &&
      Date.parse(record.paperworkSignedAt) >= todayStart
    ) {
      signedToday += 1;
    }

    if (
      record.paperworkStatus === "sent" ||
      record.paperworkStatus === "viewed" ||
      record.workflowStatus === "Paperwork Sent"
    ) {
      waitingOnSignature += 1;
    }

    if (isUnassignedRecruiter(record.assignedRecruiter)) {
      needsRecruiterAssignment += 1;
    }

    if (["Not Qualified", "Active Rep", "Loaded in MEL"].includes(record.workflowStatus)) {
      disqualifiedArchived += 1;
      continue;
    }

    if (
      !isUnassignedRecruiter(record.assignedRecruiter) &&
      record.paperworkStatus !== "signed" &&
      record.paperworkStatus !== "sent" &&
      ["Qualified", "Paperwork Needed", "Needs Review"].includes(record.workflowStatus)
    ) {
      eligibleForPaperwork += 1;
      queueRemaining += 1;
    }
  }

  return {
    eligibleForPaperwork,
    waitingOnSignature,
    signedToday,
    invalidEmail: 0,
    duplicateCandidates: 0,
    manualReview: 0,
    disqualifiedArchived,
    needsRecruiterAssignment,
    queueRemaining,
  };
}
