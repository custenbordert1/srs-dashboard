# P214 — Controlled Unsent Applicant Test Batch — Send Report

Generated: 2026-07-17T17:32:52.937Z
Cohort: `p214-e2b9e254d439` (fingerprint `e2b9e254d4399c40…`)

> P214 will send up to 20 Dropbox Sign test-mode envelopes. These envelopes are not legally binding and do not count as production paperwork.

## Eligibility funnel

| Metric | Count |
| --- | --- |
| Applicants reviewed | 853 |
| Confirmed previously sent (workflow + prior cohorts) | 387 |
| Confirmed signed | 18 |
| Viewed | 26 |
| Pending envelopes | 1 |
| Duplicate identities | 96 |
| Already placed on active work | 15 |
| Stage not authorized for paperwork | 302 |
| Missing required information | 4 |
| Blocked by coverage | 2 |
| Blocked by DM assignment | 2 |
| Blocked by non-geographic posting | 2 |
| Eligible and unsent (UNSENT_CONFIRMED, gates passed) | 0 |
| Frozen test cohort | 0 (max 20) |

## Send results (test mode)

| Metric | Count |
| --- | --- |
| Attempted | 0 |
| Confirmed test sends | 0 |
| Failed | 0 |
| Skipped | 0 |
| Duplicates prevented | 0 |
| Existing envelopes discovered | 0 |
| Dropbox request IDs recorded | 0 |
| test_mode=true verified per envelope | 0 |
| Members with exactly one new test envelope | 0 |
| Viewed so far | 0 |
| Signed / complete so far | 0 |
| Candidates outside cohort touched | 0 |
| MEL writes | 0 |

## Workflow transitions

- None

## Safety statement

- Every envelope in this batch was created with `test_mode=true`. **They are not legally
  binding and do not count as production paperwork.**
- No production envelopes were sent. No MEL writes. No DM reassignments. No job posting
  changes. No continuous automation was activated.
- No candidate outside the frozen cohort was touched.
- Stop condition honored: preflight stop — Frozen cohort is empty — nothing to send (no envelope created)

