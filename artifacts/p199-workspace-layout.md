# P199 — Candidate Workspace Layout

## Goal

Reduce vertical scroll and click depth so primary recruiter actions are reachable immediately after opening a candidate.

## Section order (top → bottom)

1. **Candidate Header** (sticky-feel header block)
   - Name
   - City, State
   - Phone
   - Email
   - Applied Date
   - Current Stage
   - Owner

2. **Primary Actions** (large control row)
   - Open Breezy
   - Resume (scrolls to resume panel)
   - Questionnaire (scrolls to questionnaire panel)
   - Send Paperwork **or**, if already sent/viewed/signed:
     - Paperwork Status
     - Viewed
     - Signed
   - Refresh Status

3. **Quick Candidate Summary**
   - AI Recommendation
   - Confidence
   - Nearby Jobs
   - Experience
   - Distance
   - Availability

4. **Timeline** (milestone pills)
   - Applied → AI Reviewed → Paperwork Sent → Viewed → Signed → Ready for Assignment

5. **Next action / Assignment** (existing controls kept, still near top)

6. **Resume + Questionnaire panels** (targets for Primary Action jump buttons)

7. **Automation Status** — `<details>` collapsed by default
   - Automation & risk
   - Required action / progression / grade / copilot
   - P193 detail panel

8. **Notes** — below automation

9. **More details** — collapsed
   - Full paperwork panel, history timeline, MEL/onboarding previews, communication log

## Click reduction

| Before | After |
|---|---|
| Scroll past summary/P193/assignment/automation to reach Send | Send / status controls in first viewport |
| Resume buried mid-panel | Resume action jumps to panel |
| Automation always expanded | Collapsed until needed |

## Non-goals

No Dropbox, reminder, AI scoring, MEL, or automation runner behavior changes—layout and queue UX only.
