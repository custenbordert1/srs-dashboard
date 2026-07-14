import type {
  P1866CohortCandidate,
  P1866Forecast,
} from "@/lib/p186-6-executive-recruiting-intelligence/types";

const MIN_SAMPLE = 8;

/**
 * Advisory forecasts only — never triggers automation.
 */
export function buildForecasts(input: {
  cohort: P1866CohortCandidate[];
  dateRangeLabel: string;
  lookbackDays?: number;
}): P1866Forecast[] {
  const days = input.lookbackDays ?? 7;
  const n = input.cohort.length;
  const insufficient = n < MIN_SAMPLE;
  const perDay = n / Math.max(1, days);

  const countStage = (stages: string[]) =>
    input.cohort.filter((c) => stages.includes(c.funnelStage)).length;

  const mk = (
    metric: string,
    expectedValue: number,
    assumptions: string[],
  ): P1866Forecast => ({
    metric,
    expectedValue: Math.round(expectedValue * 10) / 10,
    confidence: insufficient ? 0.25 : Math.min(0.85, 0.4 + n / 100),
    assumptions,
    inputDateRange: input.dateRangeLabel,
    sampleSize: n,
    insufficientData: insufficient,
    warning: insufficient
      ? `Insufficient data (n=${n} < ${MIN_SAMPLE}) — forecast is illustrative only`
      : null,
  });

  return [
    mk("expected_paperwork_sends", perDay * countStage(["PAPERWORK_NEEDED"]) / Math.max(1, n) * 7, [
      "Based on PAPERWORK_NEEDED share over lookback",
      "Does not authorize P185 sends",
    ]),
    mk(
      "expected_signatures",
      (countStage(["PAPERWORK_SENT", "PAPERWORK_VIEWED"]) / Math.max(1, days)) * 7,
      ["Assumes historical await-signature clearance rate"],
    ),
    mk(
      "expected_onboarding_completions",
      (countStage(["PAPERWORK_SIGNED"]) / Math.max(1, days)) * 7,
      ["Assumes signed candidates progress to onboarding review"],
    ),
    mk(
      "expected_ready_for_mel",
      (countStage(["ONBOARDING_COMPLETE", "READY_FOR_MEL"]) / Math.max(1, days)) * 7,
      ["Advisory volume for Ready for MEL review"],
    ),
    mk(
      "expected_mel_export_review_volume",
      (countStage(["READY_FOR_MEL", "MEL_EXPORT_REVIEW"]) / Math.max(1, days)) * 7,
      ["No automatic MEL export"],
    ),
    mk(
      "estimated_backlog_clearance_days",
      countStage(["PAPERWORK_SENT", "PAPERWORK_VIEWED", "PAPERWORK_SIGNED", "READY_FOR_MEL"]) /
        Math.max(0.1, perDay),
      ["Simple backlog / daily throughput estimate"],
    ),
  ];
}
