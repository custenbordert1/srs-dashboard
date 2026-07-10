import type { P1852Projection } from "@/lib/p185-2-selected-hire-recovery/types";

export function projectP1852ControlledRollout(input: {
  eligibleCount: number;
  maxSendsPerCycle?: number;
  maxPerMinute?: number;
  maxPerHour?: number;
  maxPerDay?: number;
  cycleIntervalMinutes?: number;
  nowMs?: number;
}): P1852Projection {
  const eligible = Math.max(0, input.eligibleCount);
  const maxSendsPerCycle = input.maxSendsPerCycle ?? 10;
  const maxPerMinute = input.maxPerMinute ?? 4;
  const maxPerHour = input.maxPerHour ?? 40;
  const maxPerDay = input.maxPerDay ?? 200;
  const cycleIntervalMinutes = input.cycleIntervalMinutes ?? 10;

  const cyclesRequired = eligible === 0 ? 0 : Math.ceil(eligible / maxSendsPerCycle);
  const hoursByCadence = (cyclesRequired * cycleIntervalMinutes) / 60;
  const hoursByHourCap = eligible === 0 ? 0 : Math.ceil(eligible / maxPerHour);
  const hoursByMinuteCap =
    eligible === 0 ? 0 : Math.ceil(eligible / maxPerMinute) / 60;
  const hoursRequired = Math.max(hoursByCadence, hoursByHourCap, hoursByMinuteCap);
  const daysRequired = eligible === 0 ? 0 : Math.ceil(eligible / maxPerDay);
  const deferredToNextDay = Math.max(0, eligible - maxPerDay);

  const notes = [
    `Cadence bottleneck: ${cyclesRequired} cycles × ${cycleIntervalMinutes} min ≈ ${hoursByCadence.toFixed(1)} h`,
    `Hourly cap ${maxPerHour}/h → ≥ ${hoursByHourCap} h`,
    `Daily cap ${maxPerDay}/day → ≥ ${daysRequired} day(s); ${deferredToNextDay} deferred past day 1`,
    `Per-minute cap ${maxPerMinute}/min and concurrent=2 further smooth bursts within each cycle`,
    `Circuit breaker stops a cycle after 3 failures — failed sends preserve queue for retry`,
  ];

  return {
    eligibleCount: eligible,
    maxSendsPerCycle,
    maxPerMinute,
    maxPerHour,
    maxPerDay,
    cycleIntervalMinutes,
    cyclesRequired,
    hoursRequired: Math.round(hoursRequired * 10) / 10,
    daysRequired,
    deferredToNextDay,
    projectedCompletionLabel:
      eligible === 0
        ? "No eligible backlog"
        : `~${cyclesRequired} cycles / ${Math.round(hoursRequired * 10) / 10} h / ${daysRequired} day(s) at configured caps`,
    rateLimitNotes: notes,
  };
}
