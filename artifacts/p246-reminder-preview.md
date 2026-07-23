# P246 — Outstanding Paperwork Reminder Preview

**Generated:** 2026-07-21T20:48:56.957Z
**Mode:** preview
**Mail mode:** log (live deliverable: no)
**Mail blocker:** DIRECT_DEPOSIT_EMAIL_MODE is not 'resend' (currently log/outbox only); RESEND_API_KEY is not configured

## Metrics

| Metric | Count |
|---|---|
| Candidates evaluated | 517 |
| Live Dropbox statuses verified | 414 |
| Eligible Reminder 1 | 144 |
| Eligible Reminder 2 | 0 |
| Eligible Reminder 3 | 0 |
| Eligible Reminder 4 | 0 |
| Eligible total | 144 |
| Signed/completed exclusions | 66 |
| Viewed but incomplete | 128 |
| Pending but incomplete | 194 |
| Recently reminded / cooldown | 101 |
| Maximum reminders reached | 0 |
| Needs recruiter follow-up | 0 |
| Missing signature request IDs | 103 |
| Invalid emails | 101 |
| Status conflicts | 77 |
| Dropbox API lookup failures | 0 |
| Status could not be verified | 0 |
| Packet email mismatches | 0 |

## Dashboard

| Metric | Value |
|---|---|
| Total outstanding paperwork | 322 |
| Pending signature | 194 |
| Viewed but not signed | 128 |
| Reminder 1 due | 144 |
| Reminder 2 due | 0 |
| Reminder 3 due | 0 |
| Reminder 4 due | 0 |
| Maximum reminders reached | 0 |
| Needs recruiter follow-up | 0 |
| Average days sent→signed | — |
| Reminder→sign conversion | — |

## Safety

- Dropbox Sign live status is the source of truth
- Does **not** resend Dropbox Sign packets
- Preview is default; live requires `--live --confirm-live`
- Max 4 automated reminders per signature request
- Idempotency key: `candidateId:signatureRequestId:reminderNumber`

## Eligible sample (first 25)

| Candidate | Email | Reminder # | Dropbox | Signature Request |
|---|---|---|---|---|
| Ruth Valdez (`a3df6cfa4a15`) | valdezruth42@gmail.com | 1 | pending | `15e3965a1487cab9ff2ac6605c5373808ed0e5ed` |
| Madison Hughes (`bb7cdad3fd23`) | madirgarrett@gmail.com | 1 | pending | `d0959466be1e34072a246496c4aba6ec7b03152e` |
| Jamie Bogden (`f67ee5c98c21`) | mzfrog87@gmail.com | 1 | pending | `555e9dd6c79ef64fe3769d82ad5fb8ed89ea535f` |
| Cassandra Mitchell (`81ee6027b70a`) | janluv08@yahoo.com | 1 | pending | `28ecf31e9650559cd692c5cd18e57a007cc395e3` |
| Kyler Alholwani (`d53781a46bab`) | marykyler123@icloud.com | 1 | pending | `8ee770acfe5c90c93e29eab02462e49843baf8ad` |
| Kinnley Welch (`94819dbb63c1`) | rhude321@gmail.com | 1 | pending | `c8152c09dcb1f5236db8ddb0b6d926d2ca046a60` |
| Heidi Raisian (`5cfd38de884a`) | heidiraisian10@gmail.com | 1 | pending | `7f73aef8a90403f10f3da9243f9e8e43bc0d6bcb` |
| Nevaeh Amaker (`c1dedf3302fc`) | nevaehamker101@gmail.com | 1 | viewed | `9d13099f6a1bc207932d0d08a44c78612f5bc0dd` |
| DaleAnna conklin (`7e1f353a507d`) | dwightman2613@gmail.com | 1 | viewed | `ec016025b784f8f07048bc344c208510bcb20e30` |
| Narlon Brown (`ab384dc191b9`) | brownnarlon9@gmail.com | 1 | viewed | `a3950197b16c470150e3a6294b0591935a63a3f1` |
| James Henry (`8375a6efc710`) | henryjim92@yahoo.com | 1 | pending | `69bbcf3e9cabcf527b5f10ab9b2c628f238b2f09` |
| Reagan Robinson (`7fb0b79681ec`) | reaganrobinson29@icloud.com | 1 | viewed | `c9a03858e804cbb6a3368626b36e53c3dadba218` |
| CAROL MCLEOD-KLAR (`9b98b1a6f49f`) | carol.klar121325@gmail.com | 1 | viewed | `81b830fc241b2d24b857c693c019922b9b2a16aa` |
| Lisa Miley (`cc2272dda159`) | lltmiley14@icloud.com | 1 | viewed | `c0b0daef644b6e4cb9a3a8e86b65081a8a1a39cf` |
| Javier Gutierrez (`8074b3b81405`) | xaviergtz@gmail.com | 1 | viewed | `acf5717e2dc27deb26f29d9521006b8fedeb3389` |
| Carol Neely (`822f3a48c65b`) | tcneely2012@gmail.com | 1 | viewed | `72dc9db32449f3d94bbfc41cfcba327b767ba1a7` |
| Jasmine Modeste (`82314d97ecf1`) | jasminem94@outlook.com | 1 | viewed | `b9751af5a49bda863dd62c0fa5cb3eba26456e3a` |
| Maria Bustamante (`c18db2f0c7f1`) | marialoreto6586@gmail.com | 1 | pending | `9623b1707e774c51999b083aeb0eefc2f9310b2e` |
| Alejandra Pineda (`073bd4133169`) | ale.pineapple061@gmail.com | 1 | pending | `8a224bcf645fb2a9c332ea7191a83b1888527105` |
| aleksey Lymar (`82f993c2a1f1`) | alekseylymar8@gmail.com | 1 | viewed | `4f7b4aed73efeeea563f71ab6ee0dcc4bc6c5766` |
| Keisha Collins (`d5e7d1e4c0a5`) | keishacollins23@gmail.com | 1 | pending | `233f0fe6bb978937934b9dec40cc82930e513720` |
| Nevaeh Johnson (`ccad91dea84f`) | iriquev@gmail.com | 1 | viewed | `07b7453fb68c8f86bc7c8856bc8987b84bd6f45f` |
| Aiden Locklear (`dd3347ccc4e4`) | lilalocklear28@gmail.com | 1 | pending | `1138ed5fa79b938ac553bae9ed4dbaec56dd830f` |
| Christyl Marcella Quinones (`9c171b3d28c7`) | marcella.quinones@outlook.com | 1 | viewed | `e1fa5d1dd3f304696098219f59c2869b647d1a48` |
| Eric Edward Lund (`b2e7c75d99ae`) | elund1987@gmail.com | 1 | pending | `06a972fa3c3f7023940edd0352495ce358e00e13` |

## Send results

- Sent records: 0
- Skip records: 0
- Failure records: 0
- Live delivery blocker: DIRECT_DEPOSIT_EMAIL_MODE is not 'resend' (currently log/outbox only); RESEND_API_KEY is not configured

## Sample email

**Subject:** Reminder: Complete Your SRS Onboarding Paperwork

```
Hi Ruth,

We're excited to have you join Strategic Retail Solutions (SRS)!

Our records show that your onboarding paperwork has been sent but has not yet been completed.

To continue with the hiring process and become eligible for upcoming work opportunities, please complete your
```

