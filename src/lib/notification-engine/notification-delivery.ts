import type {
  NotificationChannel,
  NotificationRecord,
} from "@/lib/notification-engine/types";

export type DeliveryDispatchResult = {
  channel: NotificationChannel;
  status: "queued" | "stub" | "skipped";
  detail: string;
};

/**
 * Future-ready delivery facade — in-app is always handled by the API/UI layer.
 * Email, SMS, and Teams are stubbed for downstream workers.
 */
export async function dispatchNotificationDelivery(
  notification: NotificationRecord,
): Promise<DeliveryDispatchResult[]> {
  const results: DeliveryDispatchResult[] = [];

  for (const channel of notification.channels) {
    if (channel === "in-app") {
      results.push({
        channel,
        status: "skipped",
        detail: "In-app delivery handled by notification center",
      });
      continue;
    }

    results.push({
      channel,
      status: "stub",
      detail: `Queued ${channel} delivery for ${notification.title}`,
    });
  }

  return results;
}

export const SUPPORTED_NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "in-app",
  "email",
  "sms",
  "teams",
];
