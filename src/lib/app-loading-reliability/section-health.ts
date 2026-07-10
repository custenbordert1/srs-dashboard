export type SectionHealthStatus =
  | "healthy"
  | "degraded"
  | "stale"
  | "error"
  | "disabled"
  | "loading"
  | "timeout";

export type SectionHealth = {
  id: string;
  label: string;
  status: SectionHealthStatus;
  lastSuccessAt: string | null;
  error: string | null;
  warning: string | null;
  elapsedMs?: number | null;
};

export function deriveSectionHealth(input: {
  id: string;
  label: string;
  loading?: boolean;
  error?: string | null;
  stale?: boolean;
  disabled?: boolean;
  lastSuccessAt?: string | null;
  elapsedMs?: number | null;
}): SectionHealth {
  if (input.disabled) {
    return {
      id: input.id,
      label: input.label,
      status: "disabled",
      lastSuccessAt: input.lastSuccessAt ?? null,
      error: null,
      warning: "Disabled by design",
      elapsedMs: input.elapsedMs ?? null,
    };
  }

  if (input.loading) {
    return {
      id: input.id,
      label: input.label,
      status: "loading",
      lastSuccessAt: input.lastSuccessAt ?? null,
      error: null,
      warning: null,
      elapsedMs: input.elapsedMs ?? null,
    };
  }

  if (input.error && !input.stale) {
    const status: SectionHealthStatus = input.error.toLowerCase().includes("timed out")
      ? "timeout"
      : "error";
    return {
      id: input.id,
      label: input.label,
      status,
      lastSuccessAt: input.lastSuccessAt ?? null,
      error: input.error,
      warning: null,
      elapsedMs: input.elapsedMs ?? null,
    };
  }

  if (input.stale || input.error) {
    return {
      id: input.id,
      label: input.label,
      status: input.stale ? "stale" : "degraded",
      lastSuccessAt: input.lastSuccessAt ?? null,
      error: input.error ?? null,
      warning: input.stale ? "Showing cached snapshot" : "Partial data available",
      elapsedMs: input.elapsedMs ?? null,
    };
  }

  return {
    id: input.id,
    label: input.label,
    status: "healthy",
    lastSuccessAt: input.lastSuccessAt ?? null,
    error: null,
    warning: null,
    elapsedMs: input.elapsedMs ?? null,
  };
}

export function collectDegradedSectionIds(sections: SectionHealth[]): string[] {
  return sections
    .filter((s) => s.status !== "healthy" && s.status !== "disabled" && s.status !== "loading")
    .map((s) => s.id);
}
