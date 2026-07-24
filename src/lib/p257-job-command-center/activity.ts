import type {
  JobCommandCenterActivityItem,
  JobCommandCenterApplicantInput,
} from "@/lib/p257-job-command-center/types";

function applicantLabel(applicant: JobCommandCenterApplicantInput): string {
  const name = `${applicant.firstName ?? ""} ${applicant.lastName ?? ""}`.trim();
  return name || applicant.email || applicant.candidateId;
}

/**
 * Build a read-only activity feed from workflow history + sync timestamps.
 * Sparse by design when durable history is thin — callers should surface dataNotes.
 */
export function buildJobCommandCenterActivity(input: {
  applicants: JobCommandCenterApplicantInput[];
  lastSynced?: string | null;
  datePosted?: string | null;
  maxItems?: number;
}): JobCommandCenterActivityItem[] {
  const items: JobCommandCenterActivityItem[] = [];
  const maxItems = input.maxItems ?? 40;

  if (input.lastSynced) {
    items.push({
      id: `sync:${input.lastSynced}`,
      at: input.lastSynced,
      kind: "sync",
      title: "Job catalog synced",
      detail: "Breezy job catalog last synced for Job Management.",
    });
  }

  if (input.datePosted) {
    items.push({
      id: `posted:${input.datePosted}`,
      at: input.datePosted,
      kind: "system",
      title: "Job posted / created",
      detail: "Posted date from Breezy catalog or local draft.",
    });
  }

  for (const applicant of input.applicants) {
    const label = applicantLabel(applicant);

    if (applicant.paperworkSignedAt) {
      items.push({
        id: `paperwork-signed:${applicant.candidateId}:${applicant.paperworkSignedAt}`,
        at: applicant.paperworkSignedAt,
        kind: "paperwork",
        title: "Paperwork signed",
        detail: label,
        candidateId: applicant.candidateId,
      });
    }
    if (applicant.paperworkSentAt) {
      items.push({
        id: `paperwork-sent:${applicant.candidateId}:${applicant.paperworkSentAt}`,
        at: applicant.paperworkSentAt,
        kind: "paperwork",
        title: "Paperwork sent",
        detail: label,
        candidateId: applicant.candidateId,
      });
    }

    for (const event of applicant.history ?? []) {
      items.push({
        id: `wf:${applicant.candidateId}:${event.id}`,
        at: event.createdAt,
        kind: "workflow",
        title: event.message || event.type,
        detail: label,
        candidateId: applicant.candidateId,
      });
    }

    if ((!applicant.history || applicant.history.length === 0) && applicant.lastActionAt) {
      items.push({
        id: `last-action:${applicant.candidateId}:${applicant.lastActionAt}`,
        at: applicant.lastActionAt,
        kind: "workflow",
        title: `Status: ${applicant.workflowStatus}`,
        detail: label,
        candidateId: applicant.candidateId,
      });
    }
  }

  items.sort((a, b) => {
    const aTime = new Date(a.at).getTime() || 0;
    const bTime = new Date(b.at).getTime() || 0;
    return bTime - aTime;
  });

  return items.slice(0, maxItems);
}
