# P244 — Open Store Applicant Reconciliation

Generated: 2026-07-21T20:07:28.081Z
Mode: reconcile_and_send (dryRun=false)
XLSX: /Users/tayloecustenborder/Documents/GitHub/srs-dashboard/artifacts/Open_Store_Candidate_Matches.xlsx
Dropbox testMode: true
Live writes: false

## Totals (must equal 81)

| Metric | Count |
| --- | ---: |
| Spreadsheet applicants | 81 |
| P243 confirmed sends | 7 |
| Remaining reviewed | 74 |
| Previously sent & verified | 64 |
| Already signed | 0 |
| Ready for MEL / active in MEL | 0 |
| Duplicates | 0 |
| Invalid emails | 0 |
| Missing ingestion / not found | 9 |
| Recovered candidates | 0 |
| Other blocked | 1 |
| Eligible found (incl. deferred) | 0 |
| Additional sends attempted | 0 |
| Additional sends confirmed | 0 |
| Deferred (API capacity) | 0 |
| Still requiring manual action | 10 |
| Remaining Dropbox safe capacity | 20 |

Check: 7 + 74 = 81 (expect 81).

## Remaining-74 category counts

| Category | Count |
| --- | ---: |
| already_sent | 64 |
| already_signed | 0 |
| ready_for_mel | 0 |
| active_in_mel | 0 |
| duplicate_candidate | 0 |
| invalid_or_missing_email | 0 |
| candidate_not_found | 0 |
| missing_durable_ingestion | 9 |
| ambiguous_candidate_match | 0 |
| inactive_or_archived_position | 0 |
| location_or_store_mismatch | 0 |
| over_60_miles | 1 |
| missing_recruiter | 0 |
| missing_district_manager | 0 |
| api_capacity_deferred | 0 |
| eligible_not_sent | 0 |
| other_blocked | 0 |

## Capacity

- Source: configured_cap
- API remaining: 25
- Safety reserve: 5
- Safe capacity: 20
- Detail: Safe capacity=20 (remaining=25 − reserve=5; source=configured_cap)

## Recovery attempts

- **TARA MESSLER** found=false method=none id=— — unresolved/ambiguous sheet match
- **Jean Cutright** found=false method=none id=— — unresolved/ambiguous sheet match
- **Amanda Wehrle** found=false method=none id=— — unresolved/ambiguous sheet match
- **Bethany McKibben** found=false method=none id=— — unresolved/ambiguous sheet match
- **Terry Muhsin** found=false method=none id=— — unresolved/ambiguous sheet match
- **melissa lloyd** found=false method=none id=— — P243 failed send — missing durable confirmation
- **Michael Cutright** found=false method=none id=— — unresolved/ambiguous sheet match
- **Heather Moore-Hinton** found=false method=none id=— — unresolved/ambiguous sheet match
- **Di'Lexus Adams** found=false method=none id=— — unresolved/ambiguous sheet match

## Individual dispositions (all 81)

### 3. Andrew Barnes

- Email: drewbarnes1985@gmail.com
- Breezy ID: 073762ce7034
- Position: Retail Coverage Merchandiser – BABCOCK RANCH, FL
- Open store: BABCOCK RANCH, FL (#6268)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 33eef61ccf31ea3f9053141db04b3387e6752a8e
- Previously sent: true
- Sent during P243: true
- Eligibility: p243_confirmed
- Reason not sent: —
- Can send now: false
- Category: p243_confirmed_send
- Recommended next action: No action — P243 send confirmed with signatureRequestId.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 4. Demarcus Lee Hamilton

- Email: hamiltondemarcus0@gmail.com
- Breezy ID: 0bdc809bea8b
- Position: Retail Service Merchandiser – Sumter, SC
- Open store: SUMTER, SC (#6065)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 6a896682b2068948cc58beeebf3c7df0b283efdd
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=6a896682b206
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 5. TARA MESSLER

- Email: taranehom@swiftemail.co
- Breezy ID: —
- Position: Retail Merchandiser (Flexible, Project-Based Work)
- Open store: PEMBROKE PINES, FL (#6140)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — unresolved/ambiguous sheet match

### 6. Justice Newman

- Email: jus.newman01@gmail.com
- Breezy ID: 172950c63495
- Position: Retail Reset & Merchandising Associate – Hillsboro, OH
- Open store: HILLSBORO, OH (#7154)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 98ba673dceebd22776b9afdc26f4d660ffbec85f
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=98ba673dceeb
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 7. Jean Cutright

- Email: cutrightjean@yahoo.com
- Breezy ID: —
- Position: Store Merchandising Specialist - MATTOON, IL
- Open store: MATTOON, IL (#7112)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — unresolved/ambiguous sheet match

### 8. Darryl T. Williams

- Email: darryltwo@hotmail.com
- Breezy ID: 26bbea1bc09f
- Position: Retail Merchandiser – Hanover Shopping District
- Open store: HANOVER, MD (#201)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: not_sent
- Signature request ID: d9d1b95ebccc7573c42d9dcb1b86969fe3b5efc9
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=d9d1b95ebccc
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 9. Joseph Rice

- Email: joerice13@hotmail.com
- Breezy ID: 28d17292b82a
- Position: Part-Time Store Merchandiser – Mansfield, OH
- Open store: TIME STORE MERCHANDISER - MANSFIELD, OH (#516)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: stale_paperwork_sent_without_packet; miles=528.1
- Can send now: false
- Category: over_60_miles
- Recommended next action: Requires explicit over-60 approval or closer store rematch.

### 10. Diana Porter

- Email: diana.porter10@gmail.com
- Breezy ID: 29ea867bdd60
- Position: Retail Service Merchandiser – Pembroke Pines, FL
- Open store: PEMBROKE PINES, FL (#6140)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 1e1ba2f22a8550b1c8d14dc7434f2f913c08135f
- Previously sent: true
- Sent during P243: true
- Eligibility: p243_confirmed
- Reason not sent: —
- Can send now: false
- Category: p243_confirmed_send
- Recommended next action: No action — P243 send confirmed with signatureRequestId.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 11. Johnna Belton

- Email: darkangel17711@gmail.com
- Breezy ID: 2e4ef6f53dfd
- Position: Retail Coverage Merchandiser – CAMDEN, SC
- Open store: CAMDEN, SC (#6071)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 4ef4c0acbddb507d6742f18f5b0003504b056f0a
- Previously sent: true
- Sent during P243: true
- Eligibility: p243_confirmed
- Reason not sent: —
- Can send now: false
- Category: p243_confirmed_send
- Recommended next action: No action — P243 send confirmed with signatureRequestId.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 12. ShaQuana Bracey

- Email: sbracey15@icloud.com
- Breezy ID: 2ea8e6c11314
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: CAYCE, SC (#8286)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: sent
- Signature request ID: cb5aadf0778c911c5bd4ab9a1c79f6593c8ddfea
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=cb5aadf0778c
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 13. Danielle Borum

- Email: deedee3894@gmail.com
- Breezy ID: 30ac6de85611
- Position: Retail Merchandiser – PLYMOUTH, PA
- Open store: PLYMOUTH, PA (#148)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 65d8fd0e5f3e24a06383aa4bfca2a30068826814
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=65d8fd0e5f3e
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 14. Ryan dinovo

- Email: rxdcandles@gmail.com
- Breezy ID: 33143c31a867
- Position: Retail Coverage Merchandiser – Bluefield, WV
- Open store: BLUEFIELD, WV (#8316)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 9ffa08caf11d404b66f701e455f122dc8bac1ae3
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=9ffa08caf11d
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 15. Amanda Wehrle

- Email: amandawehrle78@gmail.com
- Breezy ID: —
- Position: Store Merchandising Specialist - MATTOON, IL
- Open store: MATTOON, IL (#7112)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — unresolved/ambiguous sheet match

### 16. Lew Gabel

- Email: lewgabel44@gmail.com
- Breezy ID: 36e8efc8d06e
- Position: Retail Coverage Merchandiser – ASHTABULA, OH
- Open store: ASHTABULA, OH (#7162)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 6140d881767798b67c14a24b12e223f2e574df53
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=6140d8817677
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 17. Arlie Cunnup

- Email: arlie.cunnup@gmail.com
- Breezy ID: 3d2ce14820ee
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: CAYCE, SC (#8286)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 9cedb486d07d4e79205c18dc55bc4002f113049a
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=9cedb486d07d
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 18. James Daniels

- Email: jdwm5000@gmail.com
- Breezy ID: 4099cfcc2bb5
- Position: Retail Service Merchandiser – Columbia, SC
- Open store: COLUMBIA, SC (#642)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: dd283f6facf8844a1cc80b8d24fddebcc1c0f168
- Previously sent: true
- Sent during P243: true
- Eligibility: p243_confirmed
- Reason not sent: —
- Can send now: false
- Category: p243_confirmed_send
- Recommended next action: No action — P243 send confirmed with signatureRequestId.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 19. Yolanda Tolson

- Email: allicanbeandmore@gmail.com
- Breezy ID: 4495910a5e9c
- Position: Retail Coverage Merchandiser – Goldsboro, NC
- Open store: GOLDSBORO, NC (#10963)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: sent
- Signature request ID: c60f5665a68f8f3a8496d430c98fa4e55ac27f55
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=c60f5665a68f
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 20. Bethany McKibben

- Email: punkymom07@gmail.com
- Breezy ID: —
- Position: Store Merchandising Specialist - MATTOON, IL
- Open store: MATTOON, IL (#7112)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — unresolved/ambiguous sheet match

### 21. Karen Adrian

- Email: karenadrian.ka@gmail.com
- Breezy ID: 4b3b7c3cdebf
- Position: Flexible Retail Merchandiser – Brandon
- Open store: BRANDON, FL (#6300)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 10f477a85187545a917226382a93dbb6503e732f
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=10f477a85187
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 22. Kuuipo Bourne

- Email: kuuipobourne@gmail.com
- Breezy ID: 562030419861
- Position: Experienced Retail Merchandiser – Laredo, TX
- Open store: LAREDO, TX (#5176)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 681b76e64570118e1b39292d59c346b507219b76
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=681b76e64570
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 23. Kuuipo Bourne

- Email: kuuipobourne@gmail.com
- Breezy ID: 562030419861
- Position: Experienced Retail Merchandiser – Laredo, TX
- Open store: LAREDO, TX (#5114)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 681b76e64570118e1b39292d59c346b507219b76
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=681b76e64570
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 24. Kuuipo Bourne

- Email: kuuipobourne@gmail.com
- Breezy ID: 562030419861
- Position: Experienced Retail Merchandiser – Laredo, TX
- Open store: LAREDO, TX (#1156)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 681b76e64570118e1b39292d59c346b507219b76
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=681b76e64570
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 25. Yvette Sumter-Rawls

- Email: yvette.sumter1@icloud.com
- Breezy ID: 57c48a2fbf3b
- Position: Retail Service Merchandiser – Columbia, SC
- Open store: COLUMBIA, SC (#642)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 72ffa7412de476246f6c767da6d37c71e343394b
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: email_fingerprint_already_sent; email_fingerprint_already_sent
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 26. Thomas Hafley

- Email: thomashafley@yahoo.com
- Breezy ID: 5802f542513a
- Position: Retail Merchandiser – MIDLAND, MI
- Open store: MIDLAND, MI (#598)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 396af49ee495e99f735394d04c8d942588bd9b6b
- Previously sent: true
- Sent during P243: true
- Eligibility: p243_confirmed
- Reason not sent: —
- Can send now: false
- Category: p243_confirmed_send
- Recommended next action: No action — P243 send confirmed with signatureRequestId.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 27. Ashley Flannory

- Email: ashflan9@gmail.com
- Breezy ID: 5ce3cbc6db69
- Position: Retail Coverage Merchandiser – BABCOCK RANCH, FL
- Open store: BABCOCK RANCH, FL (#6268)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 3478ab2c3a5c6266d844bf64c202799cac78c78f
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=3478ab2c3a5c
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 28. Janet Mitchell

- Email: noah0319@gmail.com
- Breezy ID: 5d564f577025
- Position: Retail Service Merchandiser – Columbia, SC
- Open store: COLUMBIA, SC (#642)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 7a80211400d9fda4b08bb600c98634389021e1cb
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: email_fingerprint_already_sent; email_fingerprint_already_sent
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 29. John Wiedenhofer Jr

- Email: jnc21718@gmail.com
- Breezy ID: 650590ddbe20
- Position: Part-Time Store Merchandiser – Dunkirk Local Route
- Open store: DUNKIRK, NY (#8180)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 6a8629dd24efc9d52c5d8ac3591abc6662018389
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=6a8629dd24ef
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 30. Harryl Avery Jr

- Email: harrylaveryjr.hr@gmail.com
- Breezy ID: 652bc90340b9
- Position: Retail Merchandiser – West Central Illinois Region
- Open store: JACKSONVILLE, IL (#7129)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: viewed
- Signature request ID: adde89370054f67c94fb4167b546813121555719
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=adde89370054
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 31. Elizabeth Odger

- Email: elizabethodger@icloud.com
- Breezy ID: 6d157217ddcd
- Position: Retail Service Representative – Lorton, VA
- Open store: LORTON, VA (#8164)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 904763d32e28d8089bb29a95eb2cf035c08954e9
- Previously sent: true
- Sent during P243: true
- Eligibility: p243_confirmed
- Reason not sent: —
- Can send now: false
- Category: p243_confirmed_send
- Recommended next action: No action — P243 send confirmed with signatureRequestId.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 32. Christina Lehman

- Email: buddy_2024@yahoo.com
- Breezy ID: 6dfd66cfe4ab
- Position: Retail Merchandiser – MIDLAND, MI
- Open store: MIDLAND, MI (#598)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: ab060184fba8a081c004fba2c2f97b17c66945e8
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=ab060184fba8
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 33. Janet Mitchell

- Email: noah0319@gmail.com
- Breezy ID: 70ae687c9907
- Position: Store Merchandising Specialist – LEXINGTON, SC
- Open store: LEXINGTON, SC (#6142)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 6cbaabc05f203f83e2285623b8e735ef0795a6db
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=6cbaabc05f20; email_dup_of=5d564f577025; phone_dup_of=5d564f577025
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 34. Michelle Walker Kaczmarek

- Email: mharris46@yahoo.com
- Breezy ID: 7714cf72542a
- Position: Retail Coverage Merchandiser – BABCOCK RANCH, FL
- Open store: BABCOCK RANCH, FL (#6268)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 0dd8985bf867ee8702d290d31514201f41d4e667
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=0dd8985bf867
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 35. SHERRI L TAYLOR

- Email: sltaylor1024@aol.com
- Breezy ID: 7781076e6cf7
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: CAYCE, SC (#8286)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 201e8a5ec7accd1809ce4c35d919cca649817ce2
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=201e8a5ec7ac
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 36. Tracy Hedderman

- Email: tracy.hedderman@gmail.com
- Breezy ID: 7c5fe50cc3ad
- Position: Retail Service Merchandiser – Pembroke Pines, FL
- Open store: PEMBROKE PINES, FL (#6140)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 9f15cd23853cac417208b93b9e43b440c0647c9f
- Previously sent: true
- Sent during P243: true
- Eligibility: p243_confirmed
- Reason not sent: —
- Can send now: false
- Category: p243_confirmed_send
- Recommended next action: No action — P243 send confirmed with signatureRequestId.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 37. iesha Pennington

- Email: penningtoniesha497@gmail.com
- Breezy ID: 80b3b52e3969
- Position: Retail Reset & Merchandising Specialist – East Central Illinois
- Open store: MATTOON, IL (#7112)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 34e0c2cc265a01d32e30c12a99f6a9e9ca072c23
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=34e0c2cc265a
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 38. Tyera Anderson-Rainey

- Email: tyera_anderson@aol.com
- Breezy ID: 84e426c6b3e7
- Position: Retail Service Merchandiser – Springfield, PA
- Open store: SPRINGFIELD, PA (#108)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: sent
- Signature request ID: 8cfc2c001f10b7b3d79b17fe1bbb4ace2d13f133
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=8cfc2c001f10
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 39. Tyera Anderson-Rainey

- Email: tyera_anderson@aol.com
- Breezy ID: 84e426c6b3e7
- Position: Retail Service Merchandiser – Springfield, PA
- Open store: SPRINGFIELD, PA (#142)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: sent
- Signature request ID: 8cfc2c001f10b7b3d79b17fe1bbb4ace2d13f133
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=8cfc2c001f10
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 40. Cindy Bras

- Email: tcwmbras@gmail.com
- Breezy ID: 86013bc718b5
- Position: Retail Service Merchandiser – Columbia, SC
- Open store: COLUMBIA, SC (#642)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 3f604daf3131d5bfd0043e5b8e8c8e63277132a9
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=3f604daf3131
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 41. Shanyn Pough

- Email: loveshanyn9@gmail.com
- Breezy ID: 8b248f4f045c
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: CAYCE, SC (#8286)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: d11de46c31b4a5b36400c0c7801e2906a38ffe58
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=d11de46c31b4
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 42. Latriena Solomon

- Email: latrienas@gmail.com
- Breezy ID: 8d14917565e9
- Position: Retail Service Merchandiser – Sumter, SC
- Open store: SUMTER, SC (#6065)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 825a4dfa5aa9a5cf33b6c802d04d869355d04f22
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=825a4dfa5aa9
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 43. Alexander Ramon Pisieczko

- Email: alexander.pisieczko@gmail.com
- Breezy ID: 94b37988e89c
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#151)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: not_sent
- Signature request ID: 65ccb3f482d86000052bc9d58d727382c30eea3d
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=65ccb3f482d8
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 44. Alexander Ramon Pisieczko

- Email: alexander.pisieczko@gmail.com
- Breezy ID: 94b37988e89c
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#8294)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: not_sent
- Signature request ID: 65ccb3f482d86000052bc9d58d727382c30eea3d
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=65ccb3f482d8
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 45. Alexander Ramon Pisieczko

- Email: alexander.pisieczko@gmail.com
- Breezy ID: 94b37988e89c
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#139)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: not_sent
- Signature request ID: 65ccb3f482d86000052bc9d58d727382c30eea3d
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=65ccb3f482d8
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 46. Niurka C Contreras

- Email: niurkac1850@gmail.com
- Breezy ID: 99baa5ce2761
- Position: Retail Service Merchandiser – Pembroke Pines, FL
- Open store: PEMBROKE PINES, FL (#6140)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 8350be7f7ce979fd00701250dd92b5dfc43245da
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=8350be7f7ce9
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 47. Phillip Bailey

- Email: jedislayer@yahoo.com
- Breezy ID: 9b1527b6b902
- Position: Retail Reset & Merchandising Associate – Hillsboro, OH
- Open store: HILLSBORO, OH (#7154)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 74606e96e94d4bf249b540972473d7c6007c33c7
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=74606e96e94d
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 48. Skyela Banse-Fay

- Email: skyelabansefay@gmail.com
- Breezy ID: 9b8aafe6a58e
- Position: Retail Coverage Merchandiser – DUNKIRK, NY
- Open store: DUNKIRK, NY (#8180)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 462c23735157d2de903927db9d2e39f94e6e9b20
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=462c23735157
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 49. Jonathan Tyrone McCray

- Email: jonmccraypressure@gmail.com
- Breezy ID: 9c1ef106b603
- Position: Retail Service Merchandiser – Sumter, SC
- Open store: SUMTER, SC (#6065)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: b289766e70c6b0ab3c63c1b4a7b947bb361ca34f
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=b289766e70c6
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 50. SHERRI L TAYLOR

- Email: sltaylor1024@aol.com
- Breezy ID: 7781076e6cf7
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: COLUMBIA, SC (#642)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 201e8a5ec7accd1809ce4c35d919cca649817ce2
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=201e8a5ec7ac; miles=182.1
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 51. Terry Muhsin

- Email: tlynn1531@icloud.com
- Breezy ID: —
- Position: Retail Merchandiser (Flexible, Project-Based Work)
- Open store: PEMBROKE PINES, FL (#6140)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — unresolved/ambiguous sheet match

### 52. Grace Tolley

- Email: gracetolley1@gmail.com
- Breezy ID: b217bf84fdd6
- Position: Retail Coverage Merchandiser – CONWAY, SC
- Open store: CONWAY, SC (#8380)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 784d4e23e28a65c522b995608827c5d91441122c
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=784d4e23e28a
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 53. Madison Hughes

- Email: madirgarrett@gmail.com
- Breezy ID: bb7cdad3fd23
- Position: Retail Reset & Merchandising Associate – Hillsboro, OH
- Open store: HILLSBORO, OH (#7154)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: d0959466be1e34072a246496c4aba6ec7b03152e
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=d0959466be1e
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 54. Nikita Gagum

- Email: nngagum85@gmail.com
- Breezy ID: bcf6b471d2a9
- Position: Retail Coverage Merchandiser – CONWAY, SC
- Open store: CONWAY, SC (#8380)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 7aec4c02fe5e5e914d21535e318bac659a23be24
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=7aec4c02fe5e
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 55. Deborah Mustico

- Email: kaisermust@aol.com
- Breezy ID: bdf0ee2e991b
- Position: Retail Coverage Merchandiser – CONWAY, SC
- Open store: CONWAY, SC (#8380)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: e8b84a5bc53aa42a53652512fe87ed062bfc5f08
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=e8b84a5bc53a
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 56. Angela Price

- Email: angelap803@yahoo.com
- Breezy ID: bfa92cb7579c
- Position: Retail Service Merchandiser – Columbia, SC
- Open store: COLUMBIA, SC (#642)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 981f3fdde4823b9445985ce07b649dd85dab2f7a
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: email_fingerprint_already_sent; email_fingerprint_already_sent
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 57. Tracy Ann Higdon

- Email: t.higdon@hotmail.com
- Breezy ID: c18062473a06
- Position: Retail Merchandiser – PLYMOUTH, PA
- Open store: PLYMOUTH, PA (#148)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: c70d0e0adaaf2ff9788f53073884a3dbe54bbb90
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=c70d0e0adaaf
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 58. Maria Bustamante

- Email: marialoreto6586@gmail.com
- Breezy ID: c18db2f0c7f1
- Position: Experienced Retail Merchandiser – Laredo, TX
- Open store: LAREDO, TX (#5176)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 9623b1707e774c51999b083aeb0eefc2f9310b2e
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=9623b1707e77
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 59. Maria Bustamante

- Email: marialoreto6586@gmail.com
- Breezy ID: c18db2f0c7f1
- Position: Experienced Retail Merchandiser – Laredo, TX
- Open store: LAREDO, TX (#5114)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 9623b1707e774c51999b083aeb0eefc2f9310b2e
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=9623b1707e77
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 60. Maria Bustamante

- Email: marialoreto6586@gmail.com
- Breezy ID: c18db2f0c7f1
- Position: Experienced Retail Merchandiser – Laredo, TX
- Open store: LAREDO, TX (#1156)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 9623b1707e774c51999b083aeb0eefc2f9310b2e
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=9623b1707e77
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 61. Rodney Morris

- Email: rodneymorris@live.com
- Breezy ID: c6a7a62c67f6
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#151)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 270fc1d8e6cd31e97cc1829a29d5cc99fa56f0fd
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=270fc1d8e6cd
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 62. Rodney Morris

- Email: rodneymorris@live.com
- Breezy ID: c6a7a62c67f6
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#8294)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 270fc1d8e6cd31e97cc1829a29d5cc99fa56f0fd
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=270fc1d8e6cd
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 63. Rodney Morris

- Email: rodneymorris@live.com
- Breezy ID: c6a7a62c67f6
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#139)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 270fc1d8e6cd31e97cc1829a29d5cc99fa56f0fd
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=270fc1d8e6cd
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 64. adrianne chicora

- Email: achicora5885@yahoo.com
- Breezy ID: cbb2ca43ace1
- Position: Retail Service Merchandiser – Springfield, PA
- Open store: SPRINGFIELD, PA (#108)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 74d0cf743227241436b127cb9810a33528b6bbf5
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=74d0cf743227
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 65. adrianne chicora

- Email: achicora5885@yahoo.com
- Breezy ID: cbb2ca43ace1
- Position: Retail Service Merchandiser – Springfield, PA
- Open store: SPRINGFIELD, PA (#142)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 74d0cf743227241436b127cb9810a33528b6bbf5
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=74d0cf743227
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 66. melissa lloyd

- Email: melissalloyd501@gmail.com
- Breezy ID: —
- Position: Retail Coverage Merchandiser - BABCOCK RANCH, FL
- Open store: BABCOCK RANCH, FL (#6268)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — P243 failed send — missing durable confirmation

### 67. Alicia Cole

- Email: soldwithcole@gmail.com
- Breezy ID: cdd389e29d52
- Position: Retail Coverage Merchandiser – Goldsboro, NC
- Open store: GOLDSBORO, NC (#10963)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 30104d1ae2e390e3eceee5cdbddbeec42e683004
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=30104d1ae2e3
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 68. Yvette Sumter-Rawls

- Email: yvette.sumter1@icloud.com
- Breezy ID: cfe8f8046aa4
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: CAYCE, SC (#8286)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 1ff5e77912b4b92a1115e01fa36bb25ac4f4554d
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=1ff5e77912b4; email_dup_of=57c48a2fbf3b; phone_dup_of=57c48a2fbf3b
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 69. Michael Cutright

- Email: michaelcutright6453@gmail.com
- Breezy ID: —
- Position: Store Merchandising Specialist - MATTOON, IL
- Open store: MATTOON, IL (#7112)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — unresolved/ambiguous sheet match

### 70. Ashley Nicole cross

- Email: buzzard5257@gmail.com
- Breezy ID: f84925d2226a
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: CAYCE, SC (#8286)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 1266955a255d6468db72a1b5cca2ebb3bf6de343
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=1266955a255d
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 71. Brian Smith

- Email: nerd0for0life@gmail.com
- Breezy ID: db05da0112e4
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#151)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: not_sent
- Signature request ID: 43bcce5a9088e9dc9cd014af640501b82c9bec3d
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=43bcce5a9088
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 72. Brian Smith

- Email: nerd0for0life@gmail.com
- Breezy ID: db05da0112e4
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#8294)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: not_sent
- Signature request ID: 43bcce5a9088e9dc9cd014af640501b82c9bec3d
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=43bcce5a9088
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 73. Brian Smith

- Email: nerd0for0life@gmail.com
- Breezy ID: db05da0112e4
- Position: Retail Service Merchandiser – PHILADELPHIA, PA
- Open store: PHILADELPHIA, PA (#139)
- Breezy stage: Applied
- Workflow stage: Paperwork Needed
- Paperwork status: not_sent
- Signature request ID: 43bcce5a9088e9dc9cd014af640501b82c9bec3d
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=43bcce5a9088
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 74. Heather Moore-Hinton

- Email: heather11028@gmail.com
- Breezy ID: —
- Position: Store Merchandising Specialist - MATTOON, IL
- Open store: MATTOON, IL (#7112)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — unresolved/ambiguous sheet match

### 75. Angela Price

- Email: angelap803@yahoo.com
- Breezy ID: e5f4cbf3d07b
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: CAYCE, SC (#8286)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 6f50180d49d2fcc8cd201e7593a5cf63947f4729
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=6f50180d49d2; email_dup_of=bfa92cb7579c; phone_dup_of=bfa92cb7579c
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 76. SHONTA ALLEN

- Email: shonta.allen93@gmail.com
- Breezy ID: e8abfdf08786
- Position: Retail Coverage Merchandiser – Goldsboro, NC
- Open store: GOLDSBORO, NC (#10963)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: c94b9cbf1edb8ab2118283a0518188776506d549
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=c94b9cbf1edb
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 77. Jennifer Walden

- Email: jennifer_walden@hotmail.com
- Breezy ID: eb96c7fe78b7
- Position: Retail Coverage Merchandiser – BABCOCK RANCH, FL
- Open store: BABCOCK RANCH, FL (#6268)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 1b90054c216e80c0a144fe23c2008d394d035270
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=1b90054c216e
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 78. Brayden Alvarez

- Email: braydenalvarez60@gmail.com
- Breezy ID: ec69193ded61
- Position: Retail Service Merchandiser – Tequesta, FL
- Open store: TEQUESTA, FL (#6283)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: e9c74ec54c2d8c85d1aa02530c555f32acab87a3
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=e9c74ec54c2d
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 79. Diane Miller

- Email: dianem77@aol.com
- Breezy ID: ef719bef01ad
- Position: Retail Coverage Merchandiser – CONWAY, SC
- Open store: CONWAY, SC (#8380)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: ef11ee9041180703099c9db10f0d79684564d07a
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=ef11ee904118
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 80. Elizabeth Seiwell

- Email: lizseiwell921@gmail.com
- Breezy ID: f0ebc7512099
- Position: Retail Service Merchandiser – Woodlyn, PA
- Open store: WOODLYN, PA (#8324)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 3e6dec1bd5a81da416014e3258a132ed8c48a88e
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=3e6dec1bd5a8
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 81. Di'Lexus Adams

- Email: dilexuscharise@gmail.com
- Breezy ID: —
- Position: Retail Display & Planogram Associate - Columbia, SC
- Open store: COLUMBIA, SC (#642)
- Breezy stage: Applied
- Workflow stage: Applied
- Paperwork status: not_sent
- Signature request ID: —
- Previously sent: false
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: no_match
- Can send now: false
- Category: missing_durable_ingestion
- Recommended next action: Recover durable ingestion/workflow, then re-score eligibility.
- Recovery: succeeded=false — unresolved/ambiguous sheet match

### 82. Ashley Nicole cross

- Email: buzzard5257@gmail.com
- Breezy ID: f84925d2226a
- Position: Retail Coverage Merchandiser – CAYCE, SC
- Open store: CAYCE, SC (#8286)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: 1266955a255d6468db72a1b5cca2ebb3bf6de343
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: onboarding_active_sig=1266955a255d
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

### 83. TOMMY EDWARD HARPER JR

- Email: tommyharper0106@gmail.com
- Breezy ID: f9d8b2c5e99d
- Position: Retail Project Representative – Mid-Michigan Territory
- Open store: MIDLAND, MI (#598)
- Breezy stage: Applied
- Workflow stage: Paperwork Sent
- Paperwork status: sent
- Signature request ID: c5144af5e9e1300655418f368c74704e20ee4798
- Previously sent: true
- Sent during P243: false
- Eligibility: blocked
- Reason not sent: signatureRequestId=c5144af5e9e1
- Can send now: false
- Category: already_sent
- Recommended next action: No resend — verified active/completed Dropbox packet.
- Send verification: verified=true — Dropbox lookup error (fetch failed); keeping already_sent on local signature evidence

## Notes

- Loaded 7 P243 confirmed send(s); 1 failure id(s).
- Loaded 81 row(s) from sheet "Matches" in /Users/tayloecustenborder/Documents/GitHub/srs-dashboard/artifacts/Open_Store_Candidate_Matches.xlsx
- Parsed 81 candidate match row(s).
- Safe capacity=20 (remaining=25 − reserve=5; source=configured_cap)
- Ingestion store candidates available: 378
- Resolved 72/81; ambiguous=0; unresolved=9.
- Classified 81: eligible=0 blocked=81 (dropped 0 duplicate sheet row(s)); wouldSend=0 deferred=0 (safeCapacity=20).
- Recovery attempted for 9; found in Breezy=0; missed=9.
- Verified 57/57 already_sent candidate(s); reclassified 0 lacking valid signature evidence.
- Totals reconcile: 81 = 7 P243 sends + 74 remaining.
- Raised AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS 1 → 29 for live canary headroom
- Prepare skipped (persist=false or empty).
- Send complete: batchesAttempted=0 confirmed=0.
- Loaded 7 P243 confirmed send(s); 1 failure id(s).
- Loaded 81 row(s) from sheet "Matches" in /Users/tayloecustenborder/Documents/GitHub/srs-dashboard/artifacts/Open_Store_Candidate_Matches.xlsx
- Parsed 81 candidate match row(s).
- Safe capacity=20 (remaining=25 − reserve=5; source=configured_cap)
- Ingestion store candidates available: 378
- Resolved 72/81; ambiguous=0; unresolved=9.
- Classified 81: eligible=0 blocked=81 (dropped 0 duplicate sheet row(s)); wouldSend=0 deferred=0 (safeCapacity=20).
- Recovery attempted for 9; found in Breezy=0; missed=9.
- Verified 57/57 already_sent candidate(s); reclassified 0 lacking valid signature evidence.
- Totals reconcile: 81 = 7 P243 sends + 74 remaining.
- Raised AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS 1 → 29 for live canary headroom
- Prepare skipped (persist=false or empty).
- Send complete: batchesAttempted=0 confirmed=0.

## Warnings

- Account probe error: fetch failed
- Production account quota=null but Dropbox testMode=true — using DROPBOX_SIGN_SAFE_SEND_CAP=25 as conservative test-mode capacity.
- fetchBreezyJobs failed: fetch failed

