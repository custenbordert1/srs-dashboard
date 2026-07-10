export const P161_SOURCE_PHASE = "P161" as const;

/** Default client-side section fetch timeout (per P161 spec). */
export const P161_CLIENT_SECTION_TIMEOUT_MS = 5_000;

/** Client fetch abort for heavy dashboard APIs (must exceed server build time). */
export const P161_CLIENT_HEAVY_FETCH_TIMEOUT_MS = 30_000;

/** Client fetch abort for standard executive dashboards. */
export const P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS = 12_000;

/** Executive panel skeleton ceiling before showing error/degraded UI. */
export const P161_EXECUTIVE_LOADING_CEILING_MS = 5_000;

/** Server-side timeout for standard recruiting dashboard APIs. */
export const P161_SERVER_DASHBOARD_TIMEOUT_MS = 25_000;

/** Server-side timeout for heavy classification / Breezy-backed builds. */
export const P161_SERVER_HEAVY_TIMEOUT_MS = 45_000;

/** App health probe timeout (aggregates P159 + P160). */
export const P161_APP_HEALTH_TIMEOUT_MS = 20_000;

export const P161_MAJOR_PAGES = [
  "command-center",
  "executive-home",
  "operations",
  "territory-field",
  "admin-data",
  "workforce-intelligence",
  "recruiting-autopilot",
  "autopilot-ops",
  "execution-center",
  "hiring-placement",
  "operations-control-center",
  "production-readiness",
  "recruiting-priorities",
  "recruiting-decisions",
  "recruiter-assignment-center",
] as const;

export const P161_HARDENED_API_ROUTES = [
  "/api/recruiting/operations-control-center",
  "/api/recruiting/production-readiness",
  "/api/recruiting/autopilot/status",
  "/api/recruiting/prioritized-queue",
  "/api/recruiting/recommended-actions",
  "/api/recruiting/recruiter-assignments",
] as const;
