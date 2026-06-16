const RE_ENGAGEMENT_ALERT_PREFIX = "re-engagement:";

export function reEngagementAlertId(candidateId: string): string {
  return `${RE_ENGAGEMENT_ALERT_PREFIX}${candidateId}`;
}

export function isReEngagementAlertId(alertId: string): boolean {
  return alertId.startsWith(RE_ENGAGEMENT_ALERT_PREFIX);
}

export function candidateIdFromReEngagementAlertId(alertId: string): string | null {
  if (!isReEngagementAlertId(alertId)) return null;
  return alertId.slice(RE_ENGAGEMENT_ALERT_PREFIX.length);
}
