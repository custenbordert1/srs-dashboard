# P245 — Onboarding Paperwork Reminder Preview

**Generated:** 2026-07-21T20:19:47.786Z
**Mode:** preview
**Mail mode:** log (live deliverable: no)
**Mail blocker:** DIRECT_DEPOSIT_EMAIL_MODE is not 'resend' (currently log/outbox only); RESEND_API_KEY is not configured

## Metrics

| Metric | Count |
|---|---|
| Candidates evaluated | 517 |
| Eligible for reminder | 251 |
| Emails sent | 0 |
| Already signed | 60 |
| Recently reminded (48h) | 0 |
| Invalid email | 88 |
| Delivery failures | 0 |
| Missing signature request | 103 |
| Active in MEL | 0 |
| Do Not Contact | 0 |
| Packet not outstanding | 0 |
| Declined | 0 |
| Expired | 0 |
| Cancelled/voided | 0 |

## Safety

- Does **not** resend Dropbox Sign packets
- Skips reminders sent within the last 48 hours
- Excludes Signed / Declined / Expired / Cancelled / Voided
- Excludes Active MEL and Do Not Contact

## Eligible sample (first 25)

| Candidate | Email | Packet | Signature Request |
|---|---|---|---|
| Ruth Valdez (`a3df6cfa4a15`) | valdezruth42@gmail.com | Pending Signature | `15e3965a1487cab9ff2ac6605c5373808ed0e5ed` |
| Madison Hughes (`bb7cdad3fd23`) | madirgarrett@gmail.com | Pending Signature | `d0959466be1e34072a246496c4aba6ec7b03152e` |
| Jamie Bogden (`f67ee5c98c21`) | mzfrog87@gmail.com | Pending Signature | `555e9dd6c79ef64fe3769d82ad5fb8ed89ea535f` |
| Cassandra Mitchell (`81ee6027b70a`) | janluv08@yahoo.com | Pending Signature | `28ecf31e9650559cd692c5cd18e57a007cc395e3` |
| Kyler Alholwani (`d53781a46bab`) | marykyler123@icloud.com | Pending Signature | `8ee770acfe5c90c93e29eab02462e49843baf8ad` |
| Kinnley Welch (`94819dbb63c1`) | rhude321@gmail.com | Pending Signature | `c8152c09dcb1f5236db8ddb0b6d926d2ca046a60` |
| Heidi Raisian (`5cfd38de884a`) | heidiraisian10@gmail.com | Pending Signature | `7f73aef8a90403f10f3da9243f9e8e43bc0d6bcb` |
| Nevaeh Amaker (`c1dedf3302fc`) | nevaehamker101@gmail.com | Viewed | `9d13099f6a1bc207932d0d08a44c78612f5bc0dd` |
| DaleAnna conklin (`7e1f353a507d`) | dwightman2613@gmail.com | Viewed | `ec016025b784f8f07048bc344c208510bcb20e30` |
| Narlon Brown (`ab384dc191b9`) | brownnarlon9@gmail.com | Viewed | `a3950197b16c470150e3a6294b0591935a63a3f1` |
| James Henry (`8375a6efc710`) | henryjim92@yahoo.com | Pending Signature | `69bbcf3e9cabcf527b5f10ab9b2c628f238b2f09` |
| Reagan Robinson (`7fb0b79681ec`) | reaganrobinson29@icloud.com | Viewed | `c9a03858e804cbb6a3368626b36e53c3dadba218` |
| CAROL MCLEOD-KLAR (`9b98b1a6f49f`) | carol.klar121325@gmail.com | Viewed | `81b830fc241b2d24b857c693c019922b9b2a16aa` |
| Lisa Miley (`cc2272dda159`) | lltmiley14@icloud.com | Viewed | `c0b0daef644b6e4cb9a3a8e86b65081a8a1a39cf` |
| Javier Gutierrez (`8074b3b81405`) | xaviergtz@gmail.com | Viewed | `acf5717e2dc27deb26f29d9521006b8fedeb3389` |
| Carol Neely (`822f3a48c65b`) | tcneely2012@gmail.com | Viewed | `72dc9db32449f3d94bbfc41cfcba327b767ba1a7` |
| Andrew Barnes (`073762ce7034`) | drewbarnes1985@gmail.com | Pending Signature | `33eef61ccf31ea3f9053141db04b3387e6752a8e` |
| Robert Stutts (`e3ed2f7a8040`) | stuttsrobert@yahoo.com | Pending Signature | `e2fd88bbc5f8d9cdeb5c8e645e4a7f6fc1d2241f` |
| Anna Ray (`244a94a0650c`) | annaray653@yahoo.com | Pending Signature | `44905858c887665fd8949581f2c33a7d96ed7d5d` |
| Jasmine Modeste (`82314d97ecf1`) | jasminem94@outlook.com | Viewed | `b9751af5a49bda863dd62c0fa5cb3eba26456e3a` |
| Maria Bustamante (`c18db2f0c7f1`) | marialoreto6586@gmail.com | Pending Signature | `9623b1707e774c51999b083aeb0eefc2f9310b2e` |
| Tracy Hedderman (`7c5fe50cc3ad`) | tracy.hedderman@gmail.com | Pending Signature | `9f15cd23853cac417208b93b9e43b440c0647c9f` |
| Alejandra Pineda (`073bd4133169`) | ale.pineapple061@gmail.com | Pending Signature | `8a224bcf645fb2a9c332ea7191a83b1888527105` |
| Diana Porter (`29ea867bdd60`) | diana.porter10@gmail.com | Pending Signature | `1e1ba2f22a8550b1c8d14dc7434f2f913c08135f` |
| Melinda Beth Haunpo (`fb347f5c11f8`) | melbellamy0@gmail.com | Pending Signature | `00680ae862cc3617f7e45cb6fef8e59f457eb334` |

## Send results

- Sent records: 0
- Failure records: 0
- Live delivery blocker: DIRECT_DEPOSIT_EMAIL_MODE is not 'resend' (currently log/outbox only); RESEND_API_KEY is not configured
- To send: set `RESEND_API_KEY` and `DIRECT_DEPOSIT_EMAIL_MODE=resend`, then re-run with `--live --confirm-live`

## Sample email

**Subject:** Reminder: Complete Your SRS Onboarding Paperwork

```
Hi Ruth,

We're excited to have you join Strategic Retail Solutions (SRS)!

Our records show that your onboarding paperwork has been sent but has not yet been completed.

To continue with the hiring process and become eligible for upcoming work opportunities, please complete your
```

