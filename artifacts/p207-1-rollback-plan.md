# P207.1 Rollback Plan

Goal: remove or hide the dashboard without touching recruiting pipeline behavior.

1. **Hide the P207 panel** — remove `<P207AutonomousReadinessPanel />` from `executive-home-panel.tsx` (or feature-flag off).
2. **Disable the API route** — delete or return 410 from `src/app/api/recruiting/p207-autonomous-readiness/route.ts`.
3. **Revert dashboard components** — revert `p207-autonomous-readiness-panel.tsx` and `src/lib/p207-autonomous-readiness-dashboard/**`.
4. **Preserve artifacts** — keep `artifacts/p207*` and `artifacts/p207-1*` for audit.
5. **Leave recruiting pipeline untouched** — no changes to Applied → Paperwork Needed → Sent → Signed → Ready for MEL transitions.
6. **Confirm no impact to P192–P206** — P207.1 is read-only; rollback does not alter pilot modules, Dropbox send engine, or MEL writers.
