import type {
  P184RateLimitConfig,
  P184RateLimitStatus,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";

function countSince(timestamps: string[], sinceMs: number): number {
  return timestamps.filter((ts) => {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) && ms >= sinceMs;
  }).length;
}

function earliestExpiry(timestamps: string[], windowMs: number, nowMs: number): string | null {
  const inWindow = timestamps
    .map((ts) => Date.parse(ts))
    .filter((ms) => Number.isFinite(ms) && ms >= nowMs - windowMs)
    .sort((a, b) => a - b);
  if (inWindow.length === 0) return null;
  return new Date(inWindow[0]! + windowMs).toISOString();
}

export function evaluateP184RateLimit(input: {
  config: P184RateLimitConfig;
  sendTimestamps: string[];
  inFlight: number;
  nowMs?: number;
}): P184RateLimitStatus {
  const nowMs = input.nowMs ?? Date.now();
  const sentLastMinute = countSince(input.sendTimestamps, nowMs - 60_000);
  const sentLastHour = countSince(input.sendTimestamps, nowMs - 3_600_000);
  const sentLastDay = countSince(input.sendTimestamps, nowMs - 86_400_000);

  const limitedBy: P184RateLimitStatus["limitedBy"] = [];
  if (sentLastMinute >= input.config.maxPerMinute) limitedBy.push("minute");
  if (sentLastHour >= input.config.maxPerHour) limitedBy.push("hour");
  if (sentLastDay >= input.config.maxPerDay) limitedBy.push("day");
  if (input.inFlight >= input.config.concurrentSends) limitedBy.push("concurrent");

  let nextAvailableAt: string | null = null;
  if (limitedBy.includes("minute")) {
    nextAvailableAt = earliestExpiry(input.sendTimestamps, 60_000, nowMs);
  } else if (limitedBy.includes("hour")) {
    nextAvailableAt = earliestExpiry(input.sendTimestamps, 3_600_000, nowMs);
  } else if (limitedBy.includes("day")) {
    nextAvailableAt = earliestExpiry(input.sendTimestamps, 86_400_000, nowMs);
  }

  return {
    config: input.config,
    sentLastMinute,
    sentLastHour,
    sentLastDay,
    inFlight: input.inFlight,
    limited: limitedBy.length > 0,
    limitedBy,
    nextAvailableAt,
  };
}

export function pruneSendTimestamps(timestamps: string[], nowMs = Date.now()): string[] {
  const cutoff = nowMs - 86_400_000;
  return timestamps.filter((ts) => {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) && ms >= cutoff;
  });
}

export function canAcquireSendSlot(status: P184RateLimitStatus): boolean {
  return !status.limited;
}
