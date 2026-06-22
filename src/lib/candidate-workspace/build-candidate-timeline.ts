import type { CandidateTimelineEntry } from "@/lib/candidate-workspace/types";

type HistoryEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

function labelForHistoryEvent(event: HistoryEvent): string {
  const message = event.message.toLowerCase();
  if (event.type === "paperwork") {
    if (message.includes("signed")) return "Dropbox Sign completed";
    if (message.includes("sent")) return "Paperwork sent";
    return "Paperwork update";
  }
  if (event.type === "assignment" && message.includes("recruiter")) return "Recruiter assigned";
  if (event.type === "assignment") return "Assignment updated";
  if (event.type === "status") {
    if (message.includes("ready for mel")) return "Ready for MEL";
    if (message.includes("interview")) return "Interview scheduled";
    if (message.includes("qualified")) return "Application qualified";
    return "Status updated";
  }
  if (event.type === "note") return "Note added";
  if (event.type === "snooze") return "Follow-up snoozed";
  return event.message;
}

function categoryForHistoryEvent(event: HistoryEvent): CandidateTimelineEntry["category"] {
  if (event.type === "paperwork") return "paperwork";
  if (event.type === "assignment") return "assignment";
  if (event.type === "status") return "status";
  if (event.type === "note") return "note";
  if (event.type === "snooze") return "communication";
  return "other";
}

export function buildCandidateTimeline(input: {
  appliedDate: string;
  history: HistoryEvent[];
}): CandidateTimelineEntry[] {
  const entries: CandidateTimelineEntry[] = [];

  if (input.appliedDate.trim()) {
    entries.push({
      id: "applied",
      label: "Applied",
      detail: "Candidate entered the pipeline",
      createdAt: input.appliedDate,
      category: "applied",
    });
  }

  for (const event of input.history) {
    entries.push({
      id: event.id,
      label: labelForHistoryEvent(event),
      detail: event.message,
      createdAt: event.createdAt,
      category: categoryForHistoryEvent(event),
    });
  }

  return entries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
