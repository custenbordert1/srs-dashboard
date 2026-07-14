# P186.5 Post-Sign Lifecycle + MEL Export Queue — Design

Generated: 2026-07-13T15:02:26.350Z

## Architecture

```
Dropbox / P184-P185 envelopes / workflow / onboarding
        │ observe (resolve + verify)
        ▼
Checklist engine → Readiness classifier → Operator queues
        │
        ├── Shadow proposals (P186.1 apply only after production write observe)
        ├── Authorized review actions → upsertCandidateWorkflow → observe
        └── Durable MEL export queue (pending_review / approved_for_export only)
```

## Safety walls

- No MEL write APIs
- No paperwork send
- No automatic approvals
- No P184/P185 changes
- P186 non-authoritative
