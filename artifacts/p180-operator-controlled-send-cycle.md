# P180 — Operator Controlled Send Cycle

Generated: 2026-07-09T17:39:51.585Z  
Path: P159 `live_cycle` → P154 → P152 → Dropbox Sign  
Gate profile: **operator** | `confirmLive`: **true** | Cap: **17**

## Pre-send checks — PASSED

| Check | Result |
| --- | --- |
| Operator gate profile | Pass (4 warnings, 0 hard blockers) |
| Lock clear | Yes |
| Runner status | stopped |
| Continuous mode | false |
| Daemon | not active |
| Dropbox budget (34 projected) | within limit |
| P152 per-candidate (selected 17) | all pass |

### Operator warnings (informational only)

- Production readiness score 70 is below 80
- P154 env not enabled in `.env.local` (enabled in process env for this cycle only)
- Scheduler recommends WAIT_10_MINUTES
- Executive approval recommendation is WAIT

### P178-ready cohort (21 candidates)

Expected P152 alphabetical send order from P178 cohort (17): april white, David Karp, DEAN B. SERGIACOMI, Gabriella Gandy, Gianna DelGarbino, Gregory Petties, Jasmine Barber, Karen Burkes, Liaunda Lang, Lindsey Aaron, Lovett Roberts, Mista Clark, Monique Franklin, Norah Jones, Nykol Tindle, Patrick Berry, Patricia Irby

**Blocked from P178 cohort:** 4 (duplicates / unassigned — not in send pool)

## Post-send results

| Metric | Value |
| --- | ---: |
| **Sent** | **17** |
| Failed | 0 |
| Skipped | 0 |
| Dry run | false |
| Duration | ~12 min |
| Queue remaining | 66 |
| Remaining P178-ready | 20 |
| Duplicates prevented (cycle) | 6 |

### Important: P152 global selection

P152 selects from **all** P152-eligible candidates alphabetically, not only the P178 newest-25 cohort. Of 17 live sends, **only 1** was from the P178-ready list (**april white**). The other 16 were eligible candidates outside the P178 cohort (e.g. Adam Furr, Anthony Miraglia, David Garcia).

**Patricia Irby:** not sent (alphabetically behind other global eligible candidates).  
**David Karp:** not sent.

### Sent candidates (17)

| Name | Email | Dropbox signatureRequestId |
| --- | --- | --- |
| David Garcia | aguaazul12@yahoo.com | 11e3a8e1da3255dede8a804c4e679aa3c05211cf |
| Darryl Hamby | hamby.darryl62@gmail.com | 6bb351bf900ba396d07d12814ce63ace53526b3f |
| Darnell Landry | landrydistribution@yahoo.com | 1d36d1a82a05028c26b48146cd50724d9f699e61 |
| Cyndi Garr | msgarr84@gmail.com | d0bf52038d5d2f455c218eb0fda00932c1a48a09 |
| Constance Smith | constancesmith335@gmail.com | 2e9993f0aec7184ce68413cd635a4daadafa5db4 |
| Christine Brow | cbrow08@gmail.com | 6eb988014c9d849c04b3dfcb61d94b0ab15eac56 |
| Cherlissa Ramsey | cherlissar32@gmail.com | b47e50f955fd64730b118470c846c7e733ec70dc |
| Chenna Kesava Rao | chennakesavarao413@gmail.com | 73fe4efcebe157f4578b34bfe62f0e616347b41c |
| Brian Smith | nerd0for0life@gmail.com | 43bcce5a9088e9dc9cd014af640501b82c9bec3d |
| Brandy Scott | momma2emg.esg2020@gmail.com | 45bfe8666bc8a3509636f417638ef450126797c8 |
| Brandon Whitfield | brandonmaurice834@gmail.com | 8cad97278e7cd4e699ec8c7f3d28c970755f2448 |
| Ashley Hunt | ashleyhunt30@icloud.com | 31317edbce6e3651d96c5bdd4e09b275610b754e |
| april white | greatdeals0501@gmail.com | 58387459360a5877eef0040c9b94c2917a747a01 |
| Anthony Miraglia | amiraglia7@outlook.com | 9d1fc6b666d6204ee3fff9a951176c11ae01b2d2 |
| Alexander Ramon Pisieczko | alexander.pisieczko@gmail.com | 65ccb3f482d86000052bc9d58d727382c30eea3d |
| Alexander Gerlad Baker | 199alexanderbaker@sorce.email | 2fdb9a7e1246801fbfc2002dfb7e3f001af48303 |
| Adam Furr | adamfurr2026@gmail.com | d5d6bdef0ca730e794efacaf0363e8feb330ab4d |

### Dropbox API usage

- POST requests: 19
- Total requests: 19
- Rate limit remaining: 5
- 429 responses: 1 (59s pause, retries succeeded)
- Within cycle budget: yes

### Safety

- No `.env.local` changes (temp process env only)
- Continuous mode / daemon not started
- No Breezy stage writes (local workflow + Dropbox Sign only)

Full JSON: `artifacts/p180-operator-controlled-send-cycle.json`
