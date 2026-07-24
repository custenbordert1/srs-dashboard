import type { HiringWorkspaceApplicantRow } from "@/lib/p258-hiring-workspace";
import type { CandidateOpsCommunicationItem } from "@/lib/p259-candidate-operations/types";

/**
 * Build an honest communications timeline from available workflow/history data.
 * Marks sparse placeholders when channels have no real events yet.
 */
export function buildCommunicationsHistory(
  row: HiringWorkspaceApplicantRow,
): CandidateOpsCommunicationItem[] {
  const items: CandidateOpsCommunicationItem[] = [];

  for (const event of row.history) {
    const kind =
      event.type === "paperwork"
        ? "paperwork"
        : event.type === "note"
          ? "operator_note"
          : "workflow";
    items.push({
      id: event.id,
      kind,
      title: event.message || event.type,
      detail: `Workflow event · ${event.type}`,
      at: event.createdAt,
    });
  }

  if (row.paperworkSentAt) {
    items.push({
      id: `${row.candidateId}-paperwork-sent`,
      kind: "email",
      title: "Paperwork packet sent",
      detail: `Template ${row.paperworkTemplateKey || "unknown"} · status ${row.paperworkStatus}`,
      at: row.paperworkSentAt,
    });
  }

  if (row.paperworkViewedAt) {
    items.push({
      id: `${row.candidateId}-paperwork-viewed`,
      kind: "paperwork",
      title: "Envelope viewed",
      detail: "Dropbox Sign viewed signal",
      at: row.paperworkViewedAt,
    });
  }

  if (row.paperworkSignedAt) {
    items.push({
      id: `${row.candidateId}-paperwork-signed`,
      kind: "paperwork",
      title: "Paperwork signed",
      detail: "Signature completed",
      at: row.paperworkSignedAt,
    });
  }

  for (const note of row.notes) {
    items.push({
      id: `${row.candidateId}-note-${note.slice(0, 24)}`,
      kind: "operator_note",
      title: "Operator note",
      detail: note,
      at: row.lastActivity,
    });
  }

  const hasEmailTraffic = items.some((item) => item.kind === "email" || item.kind === "manual_email");
  const hasReminder = items.some((item) => item.kind === "reminder");
  const hasSms = items.some((item) => item.kind === "sms");
  const hasPhone = items.some((item) => item.kind === "phone_note");

  if (!hasEmailTraffic) {
    items.push({
      id: `${row.candidateId}-sparse-email`,
      kind: "manual_email",
      title: "No manual email history",
      detail: "Email thread history is not captured in this workspace yet (P262 inbox hook).",
      at: null,
      sparse: true,
    });
  }

  if (!hasReminder) {
    items.push({
      id: `${row.candidateId}-sparse-reminder`,
      kind: "reminder",
      title: "No reminder history",
      detail: "Reminder engine not wired (P261). Preview-only from action bar.",
      at: null,
      sparse: true,
    });
  }

  if (!hasSms) {
    items.push({
      id: `${row.candidateId}-sparse-sms`,
      kind: "sms",
      title: "SMS — future",
      detail: "SMS channel not stored yet. Action bar opens sms: compose only.",
      at: null,
      sparse: true,
    });
  }

  if (!hasPhone) {
    items.push({
      id: `${row.candidateId}-sparse-phone`,
      kind: "phone_note",
      title: "No phone notes",
      detail: "Phone call notes are not captured in durable workflow history yet.",
      at: null,
      sparse: true,
    });
  }

  items.sort((a, b) => {
    if (a.sparse && !b.sparse) return 1;
    if (!a.sparse && b.sparse) return -1;
    const atA = a.at ? new Date(a.at).getTime() : 0;
    const atB = b.at ? new Date(b.at).getTime() : 0;
    return atB - atA;
  });

  return items;
}
