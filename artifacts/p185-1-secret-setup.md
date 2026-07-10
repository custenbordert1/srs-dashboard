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

Local example (.env.local — gitignored):

```
CRON_SECRET=generate-a-long-random-value
P185_PRODUCTION_AUTOMATION_ENABLED=
P185_DURABLE_DATA_DIR=
```

Leave P185_PRODUCTION_AUTOMATION_ENABLED unset until live activation checklist is complete.
