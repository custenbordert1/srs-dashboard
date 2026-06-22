import type { CommunicationLogEntry } from "@/lib/candidate-workspace/types";

type HistoryEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

function channelForEvent(event: HistoryEvent): CommunicationLogEntry["channel"] {
  const message = event.message.toLowerCase();
  if (event.type === "snooze") return "follow-up";
  if (message.includes("follow-up") || message.includes("follow up")) return "follow-up";
  if (message.includes("email")) return "email";
  if (message.includes("text") || message.includes("sms")) return "text";
  if (message.includes("call") || message.includes("phone")) return "call";
  if (event.type === "note") return "note";
  return "other";
}

export function buildCommunicationLog(history: HistoryEvent[]): CommunicationLogEntry[] {
  return history
    .filter((event) => event.type === "note" || event.type === "snooze" || event.message.toLowerCase().includes("follow"))
    .map((event) => ({
      id: event.id,
      channel: channelForEvent(event),
      summary: event.message,
      createdAt: event.createdAt,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
