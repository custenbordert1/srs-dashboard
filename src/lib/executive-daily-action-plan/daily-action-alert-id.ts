const DAILY_ACTION_ALERT_PREFIX = "daily-action:";

export function dailyActionAlertId(recommendationId: string): string {
  return `${DAILY_ACTION_ALERT_PREFIX}${recommendationId}`;
}

export function isDailyActionAlertId(alertId: string): boolean {
  return alertId.startsWith(DAILY_ACTION_ALERT_PREFIX);
}

export function recommendationIdFromDailyActionAlertId(alertId: string): string | null {
  if (!isDailyActionAlertId(alertId)) return null;
  return alertId.slice(DAILY_ACTION_ALERT_PREFIX.length);
}
