export type DegradedModeKind = "timeout" | "error" | "partial" | "disabled" | "observation";

export type DegradedModeWarning = {
  kind: DegradedModeKind;
  title: string;
  message: string;
  retryable: boolean;
};

export function buildDegradedWarning(input: {
  label: string;
  kind: DegradedModeKind;
  detail?: string | null;
  timedOut?: boolean;
}): DegradedModeWarning {
  if (input.kind === "disabled") {
    return {
      kind: "disabled",
      title: "Disabled by design",
      message: `${input.label} is intentionally off in observation mode.`,
      retryable: false,
    };
  }

  if (input.kind === "observation") {
    return {
      kind: "observation",
      title: "Observation mode",
      message: `${input.label} is running in manual / observation mode only.`,
      retryable: false,
    };
  }

  if (input.timedOut) {
    return {
      kind: "timeout",
      title: "Slow response",
      message: `${input.label} is taking longer than expected. Showing the last available snapshot.`,
      retryable: true,
    };
  }

  return {
    kind: input.kind,
    title: input.kind === "partial" ? "Partial data" : "Degraded",
    message:
      input.detail ??
      `${input.label} could not fully load. Showing the last available snapshot where possible.`,
    retryable: true,
  };
}

export function buildDisabledByDesignLabel(feature: string): string {
  return `${feature} — disabled by design (observation mode)`;
}

export function buildManualModeLabel(feature: string): string {
  return `${feature} — manual mode`;
}
