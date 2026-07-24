/** P188.6 — Controlled 50-candidate recruiter restore batch. */

export const P188_6_SOURCE_PHASE = "P188.6" as const;
export const P188_6_SCHEMA_VERSION = 1 as const;
export const P188_6_BATCH_SIZE = 50 as const;
export const P188_6_SUB_BATCH_SIZE = 10 as const;
export const P188_6_AUTH_EXPIRATION_HOURS = 4 as const;
export const P188_6_MAX_RECRUITER_WRITES = 50 as const;
export const P188_6_MAX_LEDGER_EVENTS = 50 as const;
