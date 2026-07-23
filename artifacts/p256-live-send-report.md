# P256 — Controlled Live Paperwork Send (Recovered Candidates)

- Generated: 2026-07-23T17:54:38.337Z
- Ops date: 2026-07-23
- Mode: **aborted**
- Production Dropbox confirmed: **true**
- testMode: **false**
- Aborted: **true** — ABORTED — Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode.

## Authorized targets (from P255)

- Sadio Mustafa (`c9f5bb769a06`) — kaibusinessminded@gmail.com — position cfd52392ca92
- melissa lloyd (`cbbd99a1d55e`) — melissalloyd501@gmail.com — position b4ee901bfd73

## Counts

| Metric | Count |
| --- | ---: |
| Evaluated | 2 |
| Eligible | 0 |
| Sent | 0 |
| Skipped | 2 |
| Failures | 0 |
| Already sent | 0 |
| Already signed | 0 |
| Gate failed after refresh | 0 |

## Dropbox quota

| Snapshot | api_signature_requests_left | Rate-limit remaining | Probed at | Error |
| --- | ---: | ---: | --- | --- |
| Before | 0 | 99 | 2026-07-23T17:54:38.710Z | Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode. |
| After | 0 | 98 | 2026-07-23T17:54:44.479Z |  |

## Production preflight

- ABORTED — Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode.
- Live pilot env OK: true
- Confirmation phrase OK: true

### Blockers

- Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode.

## Refresh

- Targets: 2
- Breezy hits: 2
- Breezy misses: 0
- Ingestion writes: 2

- Preserved durable location for c9f5bb769a06: N Little Rock, AR (Breezy list omitted address)
- Breezy refresh OK: Sadio Mustafa (c9f5bb769a06) via position cfd52392ca92
- Preserved durable location for cbbd99a1d55e: BABCOCK RANCH, FL (Breezy list omitted address)
- Breezy refresh OK: melissa lloyd (cbbd99a1d55e) via position b4ee901bfd73
- Ingestion durable writes=2
- Published jobs loaded=274
- Opportunity geocode points=259

## Integrity

- Integrity OK — verified 0/0 Dropbox request(s).

## Candidates

| Name | Email | Location | Recruiter | DM | Result | Signature Request ID | Refreshed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sadio Mustafa | kaibusinessminded@gmail.com | N Little Rock, AR | Taylor | Lori VandeWiele | skipped_quota_abort |  | true |
|  | blockers: (none) | error: ABORTED — Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode. |  |  |  |  |  |
| melissa lloyd | melissalloyd501@gmail.com | BABCOCK RANCH, FL | Taylor | Erin Boatright | skipped_quota_abort |  | true |
|  | blockers: (none) | error: ABORTED — Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode. |  |  |  |  |  |

## Safety

- Live mode authorized: true
- Production Dropbox only: true
- Only authorized candidates: true
- No bulk sends: true
- No retries on failure: true
- Unauthorized attempts: 0
- Simulated sends: 0
- Reminder emails sent: 0

## Artifacts

- `artifacts/p256-live-send-report.json`
- `artifacts/p256-live-send-report.md`
