import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  getSignatureRequest,
  readDropboxSignConfig,
  type DropboxSignRequestSummary,
} from "@/lib/dropbox-sign";
import { normalizeDropboxMonitorStatus } from "@/lib/paperwork-monitor/normalize-dropbox-status";
import {
  P245_REMINDER_COOLDOWN_MS,
  type P245CandidateEvaluation,
  type P245PacketStatus,
  type P245ReminderStore,
  type P245SkipReason,
} from "@/lib/p245-onboarding-paperwork-reminders/types";
import {
  getCandidateReminderState,
  wasRemindedWithinCooldown,
} from "@/lib/p245-onboarding-paperwork-reminders/store";
import { extractFirstName } from "@/lib/p245-onboarding-paperwork-reminders/template";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNC_HINTS = [
  "do not contact",
  "do-not-contact",
  "donotcontact",
  "dnc",
  "opt out",
  "opt-out",
  "opted out",
  "unsubscribe",
];
const MEL_ACTIVE = new Set(["Loaded in MEL", "Active Rep"]);
const PAPERWORK_SENT_EQUIV = new Set(["sent", "viewed"]);
const OUTSTANDING_PACKET = new Set<P245PacketStatus>(["Pending Signature", "Viewed"]);

export function isValidP245Email(email: string | null | undefined): boolean {
  const trimmed = email?.trim().toLowerCase() ?? "";
  return Boolean(trimmed) && EMAIL_RE.test(trimmed);
}

export function resolveCandidateEmail(
  workflow: CandidateWorkflowRecord,
  candidate: BreezyCandidate | null,
): string | null {
  const fromWorkflow = workflow.onboardingContactEmail?.trim() || "";
  if (fromWorkflow) return fromWorkflow.toLowerCase();
  const fromCandidate = candidate?.email?.trim() || "";
  return fromCandidate ? fromCandidate.toLowerCase() : null;
}

export function resolveCandidateName(
  workflow: CandidateWorkflowRecord,
  candidate: BreezyCandidate | null,
): string {
  if (candidate) {
    const composed = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim();
    if (composed) return composed;
  }
  return workflow.candidateId;
}

export function isDoNotContact(
  workflow: CandidateWorkflowRecord,
  candidate: BreezyCandidate | null,
): boolean {
  const haystack = [
    ...(workflow.notes ?? []),
    workflow.nextActionNeeded ?? "",
    workflow.workflowStatus ?? "",
    candidate?.stage ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return DNC_HINTS.some((hint) => haystack.includes(hint));
}

export function isActiveInMel(workflow: CandidateWorkflowRecord): boolean {
  return MEL_ACTIVE.has(workflow.workflowStatus);
}

export function mapDropboxToPacketStatus(
  summary: DropboxSignRequestSummary,
): P245PacketStatus {
  const status = normalizeDropboxMonitorStatus(summary);
  switch (status) {
    case "awaiting_signature":
      return "Pending Signature";
    case "viewed":
      return "Viewed";
    case "signed":
      return "Signed";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    case "canceled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

export function mapWorkflowToPacketStatus(
  workflow: CandidateWorkflowRecord,
): { status: P245PacketStatus; source: "workflow" | "none" } {
  if (workflow.paperworkStatus === "signed" || workflow.workflowStatus === "Signed") {
    return { status: "Signed", source: "workflow" };
  }
  if (workflow.paperworkStatus === "declined") {
    return { status: "Declined", source: "workflow" };
  }
  if (workflow.paperworkStatus === "failed") {
    return { status: "Voided", source: "workflow" };
  }
  if (workflow.paperworkStatus === "viewed") {
    return { status: "Viewed", source: "workflow" };
  }
  if (workflow.paperworkStatus === "sent") {
    return { status: "Pending Signature", source: "workflow" };
  }
  return { status: "Unknown", source: "none" };
}

function skip(
  reason: P245SkipReason,
  detail: string,
): { skipReason: P245SkipReason; skipDetail: string; eligible: false } {
  return { skipReason: reason, skipDetail: detail, eligible: false };
}

export function evaluateP245Eligibility(input: {
  workflow: CandidateWorkflowRecord;
  candidate: BreezyCandidate | null;
  store: P245ReminderStore;
  packetStatus: P245PacketStatus;
  packetStatusSource: "dropbox" | "workflow" | "none";
  nowMs?: number;
}): P245CandidateEvaluation {
  const nowMs = input.nowMs ?? Date.now();
  const { workflow, candidate, store, packetStatus, packetStatusSource } = input;
  const name = resolveCandidateName(workflow, candidate);
  const firstName = candidate?.firstName?.trim()
    ? candidate.firstName.trim()
    : extractFirstName(name);
  const email = resolveCandidateEmail(workflow, candidate);
  const reminder = getCandidateReminderState(store, workflow.candidateId);
  const signatureRequestId = workflow.signatureRequestId?.trim() || null;

  const base: P245CandidateEvaluation = {
    candidateId: workflow.candidateId,
    candidateName: name,
    firstName,
    email,
    signatureRequestId,
    workflowStatus: workflow.workflowStatus,
    paperworkStatus: workflow.paperworkStatus,
    packetStatus,
    packetStatusSource,
    eligible: false,
    skipReason: "not_paperwork_sent",
    skipDetail: null,
    reminderCount: reminder.reminderCount,
    lastReminderAt: reminder.lastReminderAt,
  };

  const paperworkOk =
    workflow.workflowStatus === "Paperwork Sent" ||
    PAPERWORK_SENT_EQUIV.has(workflow.paperworkStatus);

  if (!paperworkOk) {
    return { ...base, ...skip("not_paperwork_sent", `workflow=${workflow.workflowStatus} paperwork=${workflow.paperworkStatus}`) };
  }

  if (!signatureRequestId) {
    return { ...base, ...skip("missing_signature_request", "No Dropbox Sign signatureRequestId") };
  }

  if (packetStatus === "Signed" || workflow.paperworkStatus === "signed" || workflow.workflowStatus === "Signed") {
    return { ...base, packetStatus: "Signed", ...skip("already_signed", "Paperwork already signed") };
  }
  if (packetStatus === "Declined" || workflow.paperworkStatus === "declined") {
    return { ...base, packetStatus: "Declined", ...skip("declined", "Packet declined") };
  }
  if (packetStatus === "Expired") {
    return { ...base, ...skip("expired", "Packet expired") };
  }
  if (packetStatus === "Cancelled") {
    return { ...base, ...skip("cancelled", "Packet cancelled") };
  }
  if (packetStatus === "Voided") {
    return { ...base, ...skip("voided", "Packet voided/failed") };
  }
  if (!OUTSTANDING_PACKET.has(packetStatus)) {
    return {
      ...base,
      ...skip("packet_not_outstanding", `Packet status ${packetStatus} is not Pending Signature/Viewed`),
    };
  }

  if (!isValidP245Email(email)) {
    return { ...base, ...skip("invalid_email", email ? `Invalid email: ${email}` : "Missing email") };
  }

  if (isActiveInMel(workflow)) {
    return { ...base, ...skip("active_in_mel", `workflowStatus=${workflow.workflowStatus}`) };
  }

  if (isDoNotContact(workflow, candidate)) {
    return { ...base, ...skip("do_not_contact", "Do Not Contact / opt-out marker found") };
  }

  if (wasRemindedWithinCooldown(reminder.lastReminderAt, P245_REMINDER_COOLDOWN_MS, nowMs)) {
    return {
      ...base,
      ...skip(
        "recently_reminded",
        `Reminder sent within 48h (last=${reminder.lastReminderAt})`,
      ),
    };
  }

  return {
    ...base,
    eligible: true,
    skipReason: "eligible",
    skipDetail: null,
  };
}

export async function probePacketStatus(input: {
  signatureRequestId: string;
  workflow: CandidateWorkflowRecord;
  probeDropbox: boolean;
}): Promise<{ status: P245PacketStatus; source: "dropbox" | "workflow" | "none" }> {
  const fallback = mapWorkflowToPacketStatus(input.workflow);
  if (!input.probeDropbox || !readDropboxSignConfig()) {
    return { status: fallback.status, source: fallback.source };
  }

  try {
    const summary = await getSignatureRequest(input.signatureRequestId);
    return { status: mapDropboxToPacketStatus(summary), source: "dropbox" };
  } catch {
    return { status: fallback.status, source: fallback.source === "none" ? "none" : "workflow" };
  }
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
