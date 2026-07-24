# P185 / P185.1 scheduler & production secrets

Never commit real secrets. Never pass secrets via query parameters.
Never log secrets or include them in artifacts / client API responses.

Required for scheduled production (after operator approval):

| Variable | Purpose |
|----------|---------|
| CRON_SECRET or P185_CRON_SECRET | Bearer / x-cron-secret auth for /api/cron/p185-paperwork-automation |
| P185_PRODUCTION_AUTOMATION_ENABLED=1 | Explicit production automation gate |
| P185_DURABLE_DATA_DIR | Absolute durable volume on serverless (not /tmp) |
| DROPBOX_SIGN_API_KEY | Dropbox Sign API |
| DROPBOX_SIGN_TEMPLATE_* | Required template IDs |
| P185_DATABASE_URL / DATABASE_URL / POSTGRES_URL | Neon or Vercel Postgres connection string for P185.5 durable state |
| P185_PGLITE_DATA_DIR | Optional local durable PGlite directory for migration validation |
| P185_PRODUCTION_STORAGE_CONFIRMED=1 | Set **only after** P185.5 migration + durability validation report `ready_to_confirm` (never fabricate) |

## P185.5 durable storage

Preferred provider: **Neon Postgres** (or Vercel Marketplace Postgres). Adapter type: `postgres`.

Local validation without Neon:

```
P185_PGLITE_DATA_DIR=.p1855-pglite
npm run p185-5:migrate
```

Do **not** set `P185_PRODUCTION_STORAGE_CONFIRMED` until the migration artifact shows `storageConfirmationStatus: ready_to_confirm`.

## Vercel Cron note (Hobby vs Pro)

Hobby accounts only allow **once-per-day** cron expressions. A `*/10 * * * *` entry in `vercel.json` fails deployment on Hobby.

Until the project is on **Pro** (or an external/company cron invokes `/api/cron/p185-paperwork-automation` every 10 minutes), do **not** add a sub-daily Vercel cron. Use the authorized operator/API path or:

```
*/10 * * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/p185-paperwork-automation
```

Local example (.env.local — gitignored):

```
CRON_SECRET=generate-a-long-random-value
P185_PRODUCTION_AUTOMATION_ENABLED=
P185_DURABLE_DATA_DIR=
```

Leave P185_PRODUCTION_AUTOMATION_ENABLED unset until live activation checklist is complete.
