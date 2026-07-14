/** P188.7 — Second controlled 50-candidate recruiter restore batch. */

export const P188_7_SOURCE_PHASE = "P188.7" as const;
export const P188_7_SCHEMA_VERSION = 1 as const;
export const P188_7_BATCH_SIZE = 50 as const;
export const P188_7_SUB_BATCH_SIZE = 10 as const;
export const P188_7_AUTH_EXPIRATION_HOURS = 4 as const;
export const P188_7_MAX_RECRUITER_WRITES = 50 as const;
export const P188_7_MAX_LEDGER_EVENTS = 50 as const;
export const P188_7_PRIOR_RESTORED_EXPECTED = 60 as const;
