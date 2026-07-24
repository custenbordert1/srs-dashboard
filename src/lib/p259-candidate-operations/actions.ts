import type {
  CandidateOpsActionDef,
  CandidateOpsBulkActionDef,
} from "@/lib/p259-candidate-operations/types";

export const CANDIDATE_OPS_ROW_ACTIONS: CandidateOpsActionDef[] = [
  {
    id: "review",
    label: "Review",
    kind: "read",
    requiresConfirm: false,
    mayWrite: false,
    description: "Open the full applicant review drawer.",
  },
  {
    id: "send_paperwork",
    label: "Send Paperwork",
    kind: "write",
    requiresConfirm: true,
    mayWrite: true,
    description:
      "Preview then confirm one production Dropbox Sign packet via Job Command Center (P260).",
  },
  {
    id: "reminder",
    label: "Reminder",
    kind: "preview",
    requiresConfirm: true,
    mayWrite: false,
    description: "Preview reminder — live send deferred to P261.",
  },
  {
    id: "open_breezy",
    label: "Open Breezy",
    kind: "external",
    requiresConfirm: false,
    mayWrite: false,
    description: "Open candidate in Breezy HR.",
  },
  {
    id: "open_dropbox",
    label: "Open Dropbox",
    kind: "external",
    requiresConfirm: false,
    mayWrite: false,
    description: "Open Dropbox Sign envelope when an ID exists.",
  },
  {
    id: "move_stage",
    label: "Move Stage",
    kind: "write",
    requiresConfirm: true,
    mayWrite: true,
    description: "Move workflow stage via existing /api/candidates/workflows after confirm.",
  },
  {
    id: "assign_recruiter",
    label: "Assign Recruiter",
    kind: "write",
    requiresConfirm: true,
    mayWrite: true,
    description: "Assign recruiter via existing workflows API after confirm.",
  },
  {
    id: "assign_dm",
    label: "Assign DM",
    kind: "write",
    requiresConfirm: true,
    mayWrite: true,
    description: "Assign DM via existing workflows API after confirm.",
  },
  {
    id: "email",
    label: "Email",
    kind: "external",
    requiresConfirm: false,
    mayWrite: false,
    description: "Open mailto: for the candidate email.",
  },
  {
    id: "call",
    label: "Call",
    kind: "external",
    requiresConfirm: false,
    mayWrite: false,
    description: "Open tel: link when a phone is on file.",
  },
  {
    id: "sms",
    label: "SMS",
    kind: "external",
    requiresConfirm: false,
    mayWrite: false,
    description: "Open sms: link when a phone is on file (compose only).",
  },
  {
    id: "copy_email",
    label: "Copy Email",
    kind: "clipboard",
    requiresConfirm: false,
    mayWrite: false,
    description: "Copy email to clipboard.",
  },
  {
    id: "copy_phone",
    label: "Copy Phone",
    kind: "clipboard",
    requiresConfirm: false,
    mayWrite: false,
    description: "Copy phone to clipboard.",
  },
  {
    id: "history",
    label: "History",
    kind: "read",
    requiresConfirm: false,
    mayWrite: false,
    description: "Jump to communications / timeline in the review drawer.",
  },
];

export const CANDIDATE_OPS_BULK_ACTIONS: CandidateOpsBulkActionDef[] = [
  {
    id: "assign_recruiter",
    label: "Assign Recruiter",
    requiresConfirm: true,
    allowsSend: false,
    mayWrite: true,
    description: "Assign the same recruiter to selected applicants after confirm.",
  },
  {
    id: "assign_dm",
    label: "Assign DM",
    requiresConfirm: true,
    allowsSend: false,
    mayWrite: true,
    description: "Assign the same DM to selected applicants after confirm.",
  },
  {
    id: "preview_paperwork",
    label: "Preview Paperwork",
    requiresConfirm: true,
    allowsSend: false,
    mayWrite: false,
    description: "Preview paperwork for selection — never bulk-sends.",
  },
  {
    id: "preview_reminder",
    label: "Preview Reminder",
    requiresConfirm: true,
    allowsSend: false,
    mayWrite: false,
    description: "Preview reminder for selection — never bulk-sends.",
  },
  {
    id: "export",
    label: "Export",
    requiresConfirm: true,
    allowsSend: false,
    mayWrite: false,
    description: "Export selected applicant rows (CSV download, local only).",
  },
];

export function getRowAction(id: CandidateOpsActionDef["id"]): CandidateOpsActionDef {
  const found = CANDIDATE_OPS_ROW_ACTIONS.find((action) => action.id === id);
  if (!found) throw new Error(`Unknown candidate ops action: ${id}`);
  return found;
}

export function getBulkAction(id: CandidateOpsBulkActionDef["id"]): CandidateOpsBulkActionDef {
  const found = CANDIDATE_OPS_BULK_ACTIONS.find((action) => action.id === id);
  if (!found) throw new Error(`Unknown bulk action: ${id}`);
  return found;
}
