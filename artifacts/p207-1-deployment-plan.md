# P207.1 Deployment Plan

Do **not** run these steps automatically. Operator-executed only.

1. Review scoped file list (P207 + P207.1 modules, API route, executive panel, tests, artifacts, package.json scripts).
2. Run tests and build (`node --import tsx --test src/lib/p207-autonomous-readiness-dashboard/__tests__/*.test.ts`, P204–P206 pilots tests, `npm run build`).
3. Commit **P207/P207.1 only** (exclude unrelated dirty worktree files).
4. Push scoped branch (manual).
5. Open PR with title: **P207 Autonomous Readiness Dashboard and Operational Alerts**.
6. Deploy preview.
7. Verify API authentication (401 without session; allowed roles only).
8. Verify stage counts match authoritative workflow totals.
9. Verify vendor-block critical alert when quota=0 and send-ready>0.
10. Verify no writes occur (lifecycle unchanged, no Dropbox sends, no MEL, no P192 start).
11. Deploy production.
12. Monitor for 30 minutes (freshness Live, alert stability / dedupe, no duplicate polling).
