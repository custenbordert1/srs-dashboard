import { randomUUID } from "node:crypto";
import {
  P107_NEEDS_ATTENTION_MS,
  P107_REMINDER_EMAIL_MS,
  P107_REMINDER_RECRUITER_MS,
  P107_REMINDER_TEXT_MS,
  type PaperworkMonitorCandidateTracking,
  type PaperworkMonitorState,
  type ReminderChannel,
  type ReminderQueueEntry,
} from "@/lib/paperwork-monitor/types";

function hasReminderChannel(
  tracking: PaperworkMonitorCandidateTracking,
  channel: ReminderChannel,
): boolean {
  return tracking.reminderHistory.some((r) => r.channel === channel);
}

function queueHasCandidate(queue: ReminderQueueEntry[], candidateId: string, channel: ReminderChannel): boolean {
  return queue.some((e) => e.candidateId === candidateId && e.channel === channel);
}

export function evaluateReminders(input: {
  tracking: PaperworkMonitorCandidateTracking;
  nowMs?: number;
}): { channel: ReminderChannel; reason: string; hoursSinceView: number } | null {
  const now = input.nowMs ?? Date.now();
  if (input.tracking.lastDropboxStatus !== "viewed") return null;
  if (input.tracking.signedAt) return null;
  if (!input.tracking.viewedAt) return null;

  const viewedMs = Date.parse(input.tracking.viewedAt);
  if (!Number.isFinite(viewedMs)) return null;
  const elapsed = now - viewedMs;
  const hoursSinceView = elapsed / (60 * 60 * 1000);

  if (elapsed >= P107_NEEDS_ATTENTION_MS && !hasReminderChannel(input.tracking, "needs_attention")) {
    return {
      channel: "needs_attention",
      reason: "Viewed 72+ hours without signature — needs attention.",
      hoursSinceView,
    };
  }
  if (elapsed >= P107_REMINDER_RECRUITER_MS && !hasReminderChannel(input.tracking, "recruiter")) {
    return {
      channel: "recruiter",
      reason: "Viewed 48+ hours without signature — notify recruiter.",
      hoursSinceView,
    };
  }
  if (elapsed >= P107_REMINDER_EMAIL_MS && !hasReminderChannel(input.tracking, "email")) {
    return {
      channel: "email",
      reason: "Viewed 24+ hours without signature — email reminder queued.",
      hoursSinceView,
    };
  }
  if (elapsed >= P107_REMINDER_TEXT_MS && !hasReminderChannel(input.tracking, "sms")) {
    return {
      channel: "sms",
      reason: "Viewed 30+ minutes without signature — text reminder queued.",
      hoursSinceView,
    };
  }

  return null;
}

export function applyReminderToState(input: {
  state: PaperworkMonitorState;
  tracking: PaperworkMonitorCandidateTracking;
  reminder: { channel: ReminderChannel; reason: string; hoursSinceView: number };
}): PaperworkMonitorState {
  const { tracking, reminder } = input;
  const now = new Date().toISOString();

  if (hasReminderChannel(tracking, reminder.channel)) return input.state;

  const entry: ReminderQueueEntry = {
    id: randomUUID(),
    candidateId: tracking.candidateId,
    candidateName: tracking.candidateName,
    channel: reminder.channel,
    generatedAt: now,
    reason: reminder.reason,
    viewedAt: tracking.viewedAt ?? now,
    hoursSinceView: reminder.hoursSinceView,
  };

  const updatedTracking: PaperworkMonitorCandidateTracking = {
    ...tracking,
    reminderCount: tracking.reminderCount + 1,
    lastReminderSentAt: now,
    needsAttention: reminder.channel === "needs_attention",
    reminderHistory: [
      ...tracking.reminderHistory,
      { at: now, channel: reminder.channel, reason: reminder.reason },
    ],
  };

  const state = { ...input.state };
  state.candidateTracking = { ...state.candidateTracking, [tracking.candidateId]: updatedTracking };

  const push = (queue: ReminderQueueEntry[]) => {
    if (queueHasCandidate(queue, tracking.candidateId, reminder.channel)) return queue;
    return [...queue, entry];
  };

  if (reminder.channel === "sms") state.textQueue = push(state.textQueue);
  else if (reminder.channel === "email") state.emailQueue = push(state.emailQueue);
  else if (reminder.channel === "recruiter") state.recruiterQueue = push(state.recruiterQueue);
  else if (reminder.channel === "needs_attention") state.needsAttention = push(state.needsAttention);

  return state;
}
