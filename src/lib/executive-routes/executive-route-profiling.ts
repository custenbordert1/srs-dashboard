export const EXECUTIVE_ROUTE_DEADLINE_MS = 5000;

export type ExecutiveRoutePhaseTiming = {
  phase: string;
  durationMs: number;
  candidateCount?: number;
  jobCount?: number;
  details?: Record<string, unknown>;
};

export type ExecutiveRouteTimingReport = {
  route: string;
  totalMs: number;
  exceededDeadline: boolean;
  deferred: boolean;
  phases: ExecutiveRoutePhaseTiming[];
};

export class ExecutiveRouteTimer {
  private readonly route: string;
  private readonly startedAt = Date.now();
  private readonly phases: ExecutiveRoutePhaseTiming[] = [];

  constructor(route: string) {
    this.route = route;
  }

  mark(
    phase: string,
    extras?: {
      candidateCount?: number;
      jobCount?: number;
      details?: Record<string, unknown>;
    },
  ): void {
    const durationMs = Date.now() - this.startedAt;
    const entry: ExecutiveRoutePhaseTiming = { phase, durationMs, ...extras };
    this.phases.push(entry);
    console.info(`[executive-route:${this.route}] ${phase}`, entry);
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  exceededDeadline(deadlineMs = EXECUTIVE_ROUTE_DEADLINE_MS): boolean {
    return this.elapsedMs() >= deadlineMs;
  }

  toReport(deferred: boolean): ExecutiveRouteTimingReport {
    return {
      route: this.route,
      totalMs: this.elapsedMs(),
      exceededDeadline: this.exceededDeadline(),
      deferred,
      phases: this.phases,
    };
  }
}

export function shouldDeferExecutiveComputation(
  timer: ExecutiveRouteTimer,
  deadlineMs = EXECUTIVE_ROUTE_DEADLINE_MS,
): boolean {
  return timer.exceededDeadline(deadlineMs);
}
