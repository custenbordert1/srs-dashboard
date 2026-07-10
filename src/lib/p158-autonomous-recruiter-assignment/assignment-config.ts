export const P158_HIGH_CONFIDENCE_THRESHOLD = 80;
export const P158_ASSIGNMENT_CONFIDENCE_THRESHOLD = 60;
export const P158_CLIENT_REQUEST_TIMEOUT_MS = 8_000;
export const P158_DEFAULT_MAX_ASSIGNMENTS_PER_RUN = 25;
export const P158_AUDIT_MAX_EVENTS = 500;

export function isP158AutomaticAssignmentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P158_AUTOMATIC_ASSIGNMENTS_ENABLED === "true";
}

export function getP158MaxAssignmentsPerRun(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.P158_MAX_ASSIGNMENTS_PER_RUN?.trim();
  if (!raw) return P158_DEFAULT_MAX_ASSIGNMENTS_PER_RUN;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P158_DEFAULT_MAX_ASSIGNMENTS_PER_RUN;
}
