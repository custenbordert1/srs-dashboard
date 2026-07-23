# P253 — Controlled Live Paperwork Send

- Generated: 2026-07-23T15:51:43.897Z
- Ops date: 2026-07-23
- Mode: **aborted**
- Production Dropbox confirmed: **true**
- testMode: **false**
- Aborted: **true** — ABORTED — Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode.

## Counts

| Metric | Count |
| --- | ---: |
| Applicants evaluated | 522 |
| Eligible | 0 |
| Sent successfully | 0 |
| Failed | 0 |
| Skipped | 0 |
| Already sent | 501 |
| Already signed | 18 |
| Duplicate prevented | 0 |
| Distance blocked | 0 |
| Missing recruiter | 1 |
| Missing DM | 0 |
| Coverage blocked | 2 |
| Qualification failed | 0 |
| Exclusion list | 0 |
| Missing identity | 0 |
| Missing email | 0 |
| Missing phone | 0 |
| Not Paperwork Needed | 0 |
| Other blocked | 0 |

## Production preflight

- ABORTED — Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode.
- Account quota (api_signature_requests_left): 0
- Rate-limit remaining (not used as quota): 98
- Live pilot env OK: true
- Confirmation phrase OK: true

### Blockers

- Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode.

## Refresh

- Ingestion: new=6 total=406
- Workflows: 951
- Dropbox reconciled: 0

- Ingestion scan ok: new=6 total=406 scanned=25
- Dropbox reconcile transitions=0
- Published jobs loaded=274
- Opportunity geocode points=259
- Ingested candidates=406
- Recruiter/DM: read-only from durable workflow (no ownership writes).

## Integrity

- Integrity OK — verified 0/0 Dropbox request(s).

## Candidates

| Name | Location | Recruiter | District Manager | Result | Signature Request ID |
| --- | --- | --- | --- | --- | --- |
| 0100790e8bc4 |  | Unassigned | Melissa O'Connor | already_sent | 35f1cb67b0a90eb77b5a24038cfca8ca43293bb9 |
| 05a9c4c35ece |  | Unassigned | Amy Harp | already_sent | d867c3802c5330a0aa896e2d144bb8adea10ba96 |
| 0ed8fd3b95f3 |  | Unassigned | Trista Thomas | already_sent | 58f7bfbf106d745e0024fdb81f8b8abc42ebdd16 |
| 1158b78ee219 |  | Unassigned | Trista Thomas | already_sent | 1b19abe81ca1781d57c70edf25f3a24246c03b5e |
| 1373fc7562e8 |  | Unassigned | Amy Harp | already_sent | f1ccec2ee0eaed946aaa0309475eb9e67119627a |
| 13e8c31452b5 |  | Unassigned | Erin Boatright | already_sent | f4c44fb159589885f147a3ac85eed0faa012fbf0 |
| 147205637f24 |  | Unassigned | Melissa O'Connor | already_signed | 5f8f54daa6e1df06ae6a42b9c115e619ca178738 |
| 18e50371df26 |  | Unassigned | Melissa O'Connor | already_sent | c20b90b414bf9428743574d87bd18537d46069e2 |
| 19f33a020c15 |  | Unassigned | Lori VandeWiele | already_sent | 11a81436e5cba464b2db949f0e8d91c8908114ec |
| 1b3a2f14b63c |  | Unassigned | Lori VandeWiele | already_sent | 34566fed8f7f253627a58ef8b40fb7cb587ed403 |
| 1b909bd699ec |  | Unassigned | Lori VandeWiele | already_sent | aaf7592078cfaf9981a747b490c75b4cd8f49250 |
| 1e4f1166d30f |  | Unassigned | Lori VandeWiele | already_sent | 36cf533ce45f5795978ac83564b80b0dd0730074 |
| 1ea4e8986dab |  | Recruiting Team | Trista Thomas | already_sent |  |
| 1ec650f8e1d9 |  | Unassigned | Mindie Rodriguez | already_sent | 81a4ba7202a5eb7f771b442b50ba999ba80ac5e4 |
| 1fd5e4b48b95 |  | Unassigned | Amy Harp | already_signed | 83807da7f675ba1cb64e65dc9556cb19034b2880 |
| 27269078a5b9 |  | Unassigned | Lori VandeWiele | already_sent | 2e06f21b9604de016a25468dff32047248ac32d5 |
| 276b822da485 |  | Unassigned | Erin Boatright | already_sent | 9e5f6851fd30607ceef9ea7702cdab830b34530f |
| 2a08788045da |  | Unassigned | Melissa O'Connor | already_sent | 6933c799ae39dcb4c203b8e435184916ac161908 |
| 2dd943b6934c |  | Unassigned | Trista Thomas | already_sent | 6c767fd67266470ea4c6417fd31d28348bd03092 |
| 2f5f144c00c8 |  | Unassigned | Lori VandeWiele | already_sent | bc891faa523889357f947a6f3801a0844af53308 |
| 2f83213d85e9 |  | Unassigned | Mindie Rodriguez | already_sent | 8e4c9a859a73e3ebb7a3130353bc6b966438498a |
| 334a0e2bcb6c |  | Unassigned | Shelly Debellis | already_sent | 1af767521dc69a3edc01142af66318c1abc59efb |
| 33db212f60e3 |  | Recruiting Team | Trista Thomas | already_sent |  |
| 36f4e45c3d3d |  | Unassigned | Erin Boatright | already_sent | 3942b9cecfa76cf2226c618d4265ccac64fd3c3f |
| 37bb15307eac |  | Unassigned | Lori VandeWiele | already_signed | 4b84f75986bb8dcfb8f5f8a8f8d3949d4899027a |
| 39ddf56edc32 |  | Unassigned | Erin Boatright | already_sent | 89762048ea99368ec7863115ee01da6cd02c9088 |
| 3a7eb2923ddf |  | Unassigned | Mindie Rodriguez | already_sent | 7ee9fed392544196c84cdb647f16f42c45077553 |
| 3e1a34625fc3 |  | Taylor | Lori VandeWiele | already_sent |  |
| 3e98b7afbc0a |  | Unassigned | Mindie Rodriguez | already_sent | 5a900cf1431acb09a0e32bf82ec8ffee867af5dc |
| 3f1f0edcde0a |  | Unassigned | Trista Thomas | already_sent | cccfcbaaee9859897b949ef6d23b54aac5a1982e |
| 3f83160751e7 |  | Unassigned | Lori VandeWiele | already_sent | 241d671fae95c46badba9e3c6b88389bb137b4f2 |
| 3fb0c007171d |  | Unassigned | Mindie Rodriguez | already_sent | 2d7177065c4686f4e17beec831f5586079e86041 |
| 41d728d745c2 |  | Unassigned | Trista Thomas | already_sent | e5aeed645e29d3c93ca3d09cf31370434ef7eeef |
| 4496378a887d |  | Taylor | Lori VandeWiele | already_sent |  |
| 46551846149e |  | Recruiting Team | Lori VandeWiele | already_sent |  |
| 48b2ee908baf |  | Recruiting Team | Lori VandeWiele | already_sent |  |
| 524e8ac69b59 |  | Unassigned | Erin Boatright | already_sent | 07f1e085566a52ac8cb402503269399374c6201a |
| 53df904d8c18 |  | Unassigned | Melissa O'Connor | already_sent | 33adcd9cbcb5fc8e56aa2201b33182b367221ebd |
| 54a9b92df06b |  | Unassigned | Lori VandeWiele | already_sent | ceb3f987661eae29f4ced4623c053b964ab357c3 |
| 54b56982f026 |  | Unassigned | Melissa O'Connor | already_signed | a62126383f8c1ed733ae2d45bd2cf87164b17da1 |
| 5661993f5f9a |  | Unassigned | Trista Thomas | already_sent | f69edbdad6f605a9dd7152b6bc7bda95eff804fd |
| 5c439012ded2 |  | Unassigned | Amy Harp | already_signed | d771eecb7b207e041eeb27c2929ee4a8f39f1574 |
| 5d4d951fcbc0 |  | Unassigned | Erin Boatright | already_sent | dc8a33d04dccc6b9873b575828bb077d63491b03 |
| 5e290d45974f |  | Unassigned | Mindie Rodriguez | already_sent | f64b14d238ca04cca233ea1947a9c7aef37063cb |
| 5eaf40cd58c1 |  | Unassigned | Erin Boatright | already_sent | d504a1addf5937d832b398b04e720a1a5ef0fef3 |
| 621ef8c8480c |  | Unassigned | Unassigned | already_sent | ec25a8a6a5309a6e0414a215d7becbd7b3c8d356 |
| 68015bc9a375 |  | Unassigned | Amy Harp | already_sent | ae76f38dc3652f9921ba51b81e86f4155a5efe50 |
| 6931fb8de72c |  | Unassigned | Shelly Debellis | already_sent | dbc513fe78c02dc9471879808b1c6e635f866e21 |
| 6acc0966d96a |  | Unassigned | Unassigned | already_sent | 80e8bcd3bc29b0dc22a60d2d505c7cefb736484d |
| 6f8b074293e1 |  | Unassigned | Mindie Rodriguez | already_sent | 1c9bd406248d03f06bc5bb64bceee1713ecb6f14 |
| 7830aa5b79b1 |  | Unassigned | Amy Harp | already_sent | 67721e008bbb4e4739df5ce29f7215f11362c4ec |
| 80da14242a1c |  | Unassigned | Lori VandeWiele | already_signed | 43a1c19ecb9e84db5a3aae8815d17eb0b1573984 |
| 82c9209fdaa1 |  | Unassigned | Amy Harp | already_sent | ef29ebeafb5cc70da8101cc9b4ded4f509a287b9 |
| 8367f72dbcc7 |  | Unassigned | Mindie Rodriguez | already_sent | c50a0cebd323c095af2272ec51260ddae9e9f7dd |
| 840c0b858148 |  | Unassigned | Unassigned | already_sent | afe35ca99fd47b26a07ca36d62cf5cf0f41a478d |
| 85092c13a69d |  | Unassigned | Mindie Rodriguez | already_signed | 4f5898a0dce85e5898edeb6b118c8e8455ecffd5 |
| 854fd7c0f321 |  | Unassigned | Unassigned | already_sent | 4395c0ea14592334d67eca9080a49b929f39746f |
| 86da01f7739b |  | Unassigned | Shelly Debellis | already_sent | b06c0d2c63f0f91d1e1df3c382aba18b9844f1d2 |
| 86ea44c3d95a |  | Unassigned | Erin Boatright | already_sent | 6b2bef7ce497a86424c0bdabffe66e3f305c3660 |
| 87b2ad945d81 |  | Unassigned | Lori VandeWiele | already_signed | e5b3890be751cd7c945873e7f601b56c5a33dcce |
| 87ea6e6dca24 |  | Unassigned | Amy Harp | already_sent | 6cb8cc83675d110a33a38415c09fb87c3d6bac97 |
| 8916bcff36b4 |  | Unassigned | Lori VandeWiele | already_sent | f81d0f08fa39507f942c007c60c9d79189033594 |
| 8c035453cf91 |  | Unassigned | Unassigned | already_sent | 0959323c9e069a7affda87ba3ac904ddd86ac581 |
| 8ec5f7b7371f |  | Unassigned | Trista Thomas | already_sent | 67bb061ee8ed850545153d7f0b7c2c2a8bb1e771 |
| 8feb7d623f55 |  | Unassigned | Lori VandeWiele | already_sent | bdf8ee5d566960bc71c6c5b59fa8e3c13c7979b3 |
| 91f84eae7546 |  | Unassigned | Lori VandeWiele | already_sent | c1276cbb2eda3080503a0d83e67e293cacd233f3 |
| 9921cca9ccbd |  | Unassigned | Erin Boatright | already_sent | ae272736f751201c7051c8fd07783b2c739ec971 |
| 9a6f590ead60 |  | Unassigned | Melissa O'Connor | already_sent | efa8c7a534e61444626a5d930da2558570e7256e |
| 9c8555abfbc7 |  | Taylor | Lori VandeWiele | already_sent |  |
| 9cdc414f3b49 |  | Unassigned | Melissa O'Connor | already_sent | d885f72be0071acb020d555336b5252afebfe68c |
| 9ef7bf235ee9 |  | Unassigned | Mindie Rodriguez | already_sent | 3b585d9430df32c1d4bf30e487a7c0e3894f2810 |
| 9f8231817090 |  | Unassigned | Mindie Rodriguez | already_signed | 0116fec632faa5386c18cddc39035437d7b10b71 |
| 9f9d978c7e71 |  | Unassigned | Shelly Debellis | already_sent | ba23bfd6e8bcc898a8ae4da5816d11ca8a7c878e |
| a02931877eec |  | Unassigned | Erin Boatright | already_sent | d43d1f39ff57a539d0594593a4b372d91bd7a048 |
| a0e30984a18d |  | Unassigned | Lori VandeWiele | already_sent | 4c00bf479b92b42d9aadcbcad89ea6c0bf1d8a55 |
| a173310d307e |  | Unassigned | Erin Boatright | already_sent | e92ae4aed832817e52cc9e71195172654b70b8f8 |
| a334176433f6 |  | Unassigned | Mindie Rodriguez | already_sent | f89d978e3d1622628d4048345949d942ab796002 |
| a4792ee6051e |  | Unassigned | Erin Boatright | already_sent | 9397bd3ed135ae2dc08ddc859d733859b8dda7d2 |
| ab3633d2b89d |  | Unassigned | Melissa O'Connor | already_sent | ab92514af5469f3468ffd14101aedf16da83dd2e |
| Abigail D'Angelo | Taylor, AZ | Recruiting Team | Shelly Debellis | already_sent | e660e8e32ffbcc5a3f9c522776e82d38603d112f |
| Adam Furr | Oviedo, FL | Unassigned | Erin Boatright | already_sent | d5d6bdef0ca730e794efacaf0363e8feb330ab4d |
| adrianne chicora | Springfield, PA | Recruiting Team | Mindie Rodriguez | already_sent | 74d0cf743227241436b127cb9810a33528b6bbf5 |
| afa4123cd361 |  | Unassigned | Lori VandeWiele | already_sent | 18799c092cecb75edaa16cd0e9b62108d3791b43 |
| Aiden Locklear | Pembroke, NC | Recruiting Team | Erin Boatright | already_sent | 1138ed5fa79b938ac553bae9ed4dbaec56dd830f |
| Alaa | MEDIA, PA | Taylor | Mindie Rodriguez | already_sent | d2026213a48cc4d78f7cb42118480c2f638e93e7 |
| Alejandra Pineda | Laredo, TX | Recruiting Team | Amy Harp | already_sent | 8a224bcf645fb2a9c332ea7191a83b1888527105 |
| aleksey Lymar | Boiling Springs, SC | Recruiting Team | Erin Boatright | already_sent | 4f7b4aed73efeeea563f71ab6ee0dcc4bc6c5766 |
| Alexander Gerlad Baker | Pensacola, FL | Recruiting Team | Erin Boatright | already_sent |  |
| Alexander Ramon Pisieczko | PHILADELPHIA, PA | Taylor | Mindie Rodriguez | already_sent | 65ccb3f482d86000052bc9d58d727382c30eea3d |
| Alexandra Ridel | Sheffield Village, OH | Unassigned | Mindie Rodriguez | already_sent | 90be7f1a4306985ff4c1f164d189836aa7987725 |
| aleziahenry13@gmail.com |  | Unassigned | Unassigned | already_sent | e6c989e10b247bfaff93b7471033cb231eacf26a |
| Alicia Cole | Goldsboro, NC | Recruiting Team | Erin Boatright | already_sent | 30104d1ae2e390e3eceee5cdbddbeec42e683004 |
| Alizia Benderman | Columbia, TN | Unassigned | Lori VandeWiele | already_sent | f613f0ee10e04bfbacacef7b50b65fbd85373dce |
| Amanda Olds | Taylor, AZ | Recruiting Team | Shelly Debellis | already_sent |  |
| Amber Haugland | Vandalia, IL | Alex | Trista Thomas | already_sent | 257871e2751f81a05ed38af4ea3d17e13454bad5 |
| Amy Aderhold | Spring, TX | Morgan | Amy Harp | already_sent | c3a84f1d5fe4a8bb0ee7fcf290ed7f2c3b4ee7cd |
| Amy Brumm | WILLIAMBURG, VA | Taylor | Mindie Rodriguez | already_sent | 3ea45b7b1bd0e38cff344ffa3e7e53d919c4e7c7 |
| Amy Dancy | Union, SC | Recruiting Team | Erin Boatright | already_sent |  |
| Ana hagen | Panama City Beach, FL | Riley | Erin Boatright | already_sent | 4d14617c4ee8b12d6c89e866f542fcd2fd66825d |
| Andrew Barnes | BABCOCK RANCH, FL | Recruiting Team | Erin Boatright | already_sent | 33eef61ccf31ea3f9053141db04b3387e6752a8e |
| Angela Price | CAYCE, SC | Recruiting Team | Erin Boatright | already_sent | 6f50180d49d2fcc8cd201e7593a5cf63947f4729 |
| Angela Price | Columbia, SC | Recruiting Team | Erin Boatright | already_sent | 981f3fdde4823b9445985ce07b649dd85dab2f7a |
| angelcowan12345@gmail.com |  | Unassigned | Unassigned | already_sent | ac46ef6f5cb2433f67d2717edc09dfc5bf5c8ef3 |
| Anil Kumar Sunkesula | NEWPORT NEWS, VA | Taylor | Mindie Rodriguez | already_sent | b7e59f50de0eada57301775e18ce6ca47991ecc4 |
| Anita Drumheller | Staunton, VA | Alex | Mindie Rodriguez | already_sent | e270f47f78f195c6cdfffc48596bca75456c4bf1 |
| Anna Ray | STEPHENVILLE, TX | Recruiting Team | Amy Harp | already_sent | 44905858c887665fd8949581f2c33a7d96ed7d5d |
| Anthony Miraglia | Wilkes Barre, PA | Taylor | Mindie Rodriguez | already_sent |  |
| April Masterson | Stuart, FL | Recruiting Team | Erin Boatright | already_sent |  |
| april white | Attalla, AL | Recruiting Team | Erin Boatright | already_sent |  |
| Arlie Cunnup | CAYCE, SC | Recruiting Team | Erin Boatright | already_sent | 9cedb486d07d4e79205c18dc55bc4002f113049a |
| Ashley Flannory | BABCOCK RANCH, FL | Taylor | Erin Boatright | already_sent | 3478ab2c3a5c6266d844bf64c202799cac78c78f |
| Ashley Hunt | Lumberton, NC | Unassigned | Erin Boatright | already_sent | 31317edbce6e3651d96c5bdd4e09b275610b754e |
| Ashley ledet | Wilmington, NC | Riley | Erin Boatright | already_sent | b3c3f6e653edcb145248d124d9b420d4175be305 |
| Ashley Nicole cross | CAYCE, SC | Riley | Erin Boatright | already_sent | 1266955a255d6468db72a1b5cca2ebb3bf6de343 |
| Ashley Nicole cross | CAYCE, SC | Riley | Erin Boatright | already_sent | adc8f641c943868430f84c40bc62132a276570c7 |
| ashley.martin215@gmail.com |  | Unassigned | Unassigned | already_sent | 18d5207fa7f1cc3f530a26837a12c62ce501bf16 |
| Austin Bishop | Pensacola, FL | Recruiting Team | Erin Boatright | already_sent |  |
| Ayreon Wilson | San Antonio, TX | Recruiting Team | Amy Harp | already_sent | 5850fe73163e631df728c4704d2238615bc1e43d |
| b06d222cb36a |  | Unassigned | Unassigned | already_sent | c31927de1ef5d866380110e9ca9d7333478f2088 |
| b21a84af7c29 |  | Unassigned | Trista Thomas | already_sent | 9f8863fd5fd2c585648e7764ee2df58da4b48c77 |
| b32054c06f54 |  | Recruiting Team | Lori VandeWiele | already_sent |  |
| b9c28c498c48 |  | Unassigned | Lori VandeWiele | already_sent | 79620ff5d1b07a3b6a4b0422b157185a59e47f13 |
| b9f4bb0667cd |  | Unassigned | Trista Thomas | already_sent | eb2df1721a7bdb8eb9e727fb685884090496fe26 |
| bbf8df76d8df |  | Unassigned | Erin Boatright | already_sent | c7b623c690f9259fcbcbb16aab7dc0ce8ac9c199 |
| berlnkelli13@gmail.com |  | Unassigned | Unassigned | already_sent | 4c3a502821d9a277578f705b766d3b97782fedaf |
| bethtorrence27@hotmail.com |  | Unassigned | Unassigned | already_sent | 0b6f6065e17634388fcd33cce62331a046bc579d |
| Bhavin Patel | Atlanta, GA | Unassigned | Erin Boatright | already_sent | 4d353aae663ca50ed94538fea5971c55b572e41d |
| Billy Joe Romero | Rincon, GA | Unassigned | Unassigned | already_sent | 2c825ca11a449a5b4ab238932301198ce90c0871 |
| Brad Horton | Stuart, FL | Recruiting Team | Erin Boatright | already_sent |  |
| Brandi Frye | Belleville, IL | Recruiting Team | Trista Thomas | already_sent |  |
| BRANDON BOYD | Valdosta, GA | Recruiting Team | Erin Boatright | already_sent |  |
| Brandy Scott | Akron, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Brayden Alvarez | Tequesta, FL | Taylor | Erin Boatright | already_sent | e9c74ec54c2d8c85d1aa02530c555f32acab87a3 |
| Brian Alspaugh | Carlisle, PA | Taylor | Mindie Rodriguez | already_sent | a64b98ae1942e8e1e0e5ac705151aa45a0e525c4 |
| Brian Felton | Taunton, MA | Taylor | Unassigned | already_sent | d2c5880c99ec4238fd92f67b413a9646cb6cf3e6 |
| Brian Smith | PHILADELPHIA, PA | Taylor | Mindie Rodriguez | already_sent | 43bcce5a9088e9dc9cd014af640501b82c9bec3d |
| Brianna Harvey | JOHNSTOWN, PA | Taylor | Mindie Rodriguez | already_sent | c068a3cebf04621765ff2e936c2937db764b6121 |
| Brittanie Kaminsky | Fayetteville, NC | Unassigned | Erin Boatright | already_sent | 6c29eaba3e570f4989bf1ee55be9fce1b2823690 |
| Brittany Mcwhorter | Locust Grove, GA | Unassigned | Erin Boatright | already_sent | e06b39ee1178364d8b8490f61199551d0c5be7ac |
| Brittney Thomas | Leesville, SC | Recruiting Team | Erin Boatright | already_sent |  |
| Brittneyrodgers201@gmail.com 6 Rodgers | Belleville, IL | Unassigned | Trista Thomas | already_sent | 65caf73838626e601f33039cd26710ac77024581 |
| Brooklynn Kenyon | CAMPBELLSVILLE, KY | Recruiting Team | Lori VandeWiele | already_sent | 9f7065624f81efa7e082908a198a7d12f61b16b0 |
| c2valen@gmail.com |  | Unassigned | Mindie Rodriguez | already_sent | 497b2fc6abb228dc35c2c4c4ddbef4e44bd24119 |
| c595e23aeb3e |  | Unassigned | Shelly Debellis | already_signed | f3a6e5cce6ae5e3ae2c3fde5f116d5795a34e332 |
| c5b23216837a |  | Unassigned | Lori VandeWiele | already_sent | d9bc15fed7f03583e5946aa4d79e1293909e01ee |
| ca747f355c14 |  | Unassigned | Lori VandeWiele | already_sent | 97913291c7fbdc1c0251f3075ced2ac181ca215c |
| Cabrina Oxendine | Pembroke, NC | Recruiting Team | Erin Boatright | already_sent | 7fb88c23b603f1f6ecceff80fd10f84231f8733f |
| Cabrina Oxendine | Lumberton, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Calvin Brown | Pensacola, FL | Casey | Erin Boatright | already_sent | 8f2ce8c67c4dc66598fd5b18ac5206649d0d1c63 |
| Carla Bynum | Attalla, AL | Unassigned | Erin Boatright | already_sent | 29d6eeb780d4aa8d07fd05195a51717a66e03073 |
| CAROL MCLEOD-KLAR | San Antonio, TX | Recruiting Team | Amy Harp | already_sent | 81b830fc241b2d24b857c693c019922b9b2a16aa |
| Carol Neely | Laurel, MS | Recruiting Team | Erin Boatright | already_sent | 72dc9db32449f3d94bbfc41cfcba327b767ba1a7 |
| Carolyn Midyette | Grantsboro, NC | Riley | Erin Boatright | already_sent | c099599869e92c5e127ab3a61a8b690e237eecf4 |
| Cassandra Dionne Walker | Locust Grove, GA | Riley | Erin Boatright | already_sent | e5920e023568923cc216a12f54eba5dba4700f17 |
| Cassandra Mitchell | Belleville, IL | Recruiting Team | Trista Thomas | already_sent | 28ecf31e9650559cd692c5cd18e57a007cc395e3 |
| Cassandra Redmon | Jacksonville, NC | Taylor | Unassigned | already_sent | f9467c8f305daebff83921cee9e671e120904b78 |
| Catherine Pardi | Plaistow, NH | Recruiting Team | Melissa O'Connor | already_sent |  |
| cfd03224d5c8 |  | Taylor | Lori VandeWiele | already_sent |  |
| Chenna Kesava Rao | Columbus, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Chenna Kesava Rao | Mansfield, LA | Unassigned | Unassigned | already_sent | 2a679356f700b4a79b11e297da4149c1d5df8658 |
| cher whetstone | LAWTON, OK | Recruiting Team | Amy Harp | already_sent | 63b64cd395791d9eda3522428ea62dba050ca5b1 |
| Cherlissa Ramsey | Cincinnati, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Chett Breland | Hattiesburg, MS | Recruiting Team | Erin Boatright | already_sent |  |
| Chirumamilla Praneetha | Vandalia, IL | Unassigned | Trista Thomas | already_sent | fc2ac195ab744ef4e7c3fdca9068f8bcb915547e |
| Cho Thet Khin | DORCHESTER, MA | Recruiting Team | Melissa O'Connor | already_sent | d01ce981e96f7c52ca21e92e571195a954b7055b |
| Christina Lehman | MIDLAND, MI | Morgan | Trista Thomas | already_sent | ab060184fba8a081c004fba2c2f97b17c66945e8 |
| Christyl Marcella Quinones | Conroe, TX | Recruiting Team | Amy Harp | already_sent | e1fa5d1dd3f304696098219f59c2869b647d1a48 |
| CIARA V SEARFOSS | Mt. Arab, AL | Recruiting Team | Erin Boatright | already_sent | c0b7dd513abf21bc54e5da2012858835a685b90d |
| Cindy Bras | Columbia, SC | Taylor | Erin Boatright | already_sent | 3f604daf3131d5bfd0043e5b8e8c8e63277132a9 |
| Clarence Hendricks | Valdosta, GA | Recruiting Team | Erin Boatright | already_sent |  |
| cmunn28@yahoo.com |  | Unassigned | Unassigned | already_sent | bc96869e57e73ddf2b59902aa435587871407384 |
| Cody Bolles | Taylor, AZ | Recruiting Team | Shelly Debellis | already_sent | 00aff2e6ab21e796fa96c07f36a6c316eb441c99 |
| consuelo.barker@yahoo.com |  | Unassigned | Unassigned | already_sent | 5475e9fea5a7488f5a9eca2dd8b86c67203074d1 |
| Cyndi Garr | Washington, PA | Unassigned | Mindie Rodriguez | already_sent | d0bf52038d5d2f455c218eb0fda00932c1a48a09 |
| Cynthia Rudy | Princeton, WV | Alex | Mindie Rodriguez | already_sent | 2ad0d2774132f3c8df212d25e97cdce406c761cf |
| D’Elizabeth Nevins | Boiling Springs, SC | Recruiting Team | Erin Boatright | already_sent | bebef4ae546c762822f0aaf4f5ec5e38a22b6d30 |
| d021d8262ef6 |  | Unassigned | Mindie Rodriguez | already_sent | 88875cbe5d3393a58b1bf615c61cd9c98a26c51f |
| d2ef0cef341f |  | Unassigned | Amy Harp | already_sent | e0f01a160df0bc98ad8e2984f46e8dd64acd58c0 |
| d39f8bc6193e |  | Unassigned | Amy Harp | already_sent | d0717ead60bf5ccb686d53b49b1cf7d864d0fc4e |
| d564979d997d |  | Unassigned | Melissa O'Connor | already_sent | fddbadd98e059ca14ae13a3463dffb46740a00d7 |
| d64647ba8a8e |  | Unassigned | Trista Thomas | already_sent | ec83c98cfc1380a28d2679d59e9520b96cabdc6e |
| d6cd926f864a |  | Unassigned | Amy Harp | already_sent | 7c6c5c834a819bd2675cef9ed20b93534658cdb3 |
| d83f33df41bd |  | Unassigned | Amy Harp | already_sent | 156c76d67b6a975f6986b79cf6a02f0afad2755b |
| d91e8871af03 |  | Unassigned | Melissa O'Connor | already_signed | 54414a58dd2f43df3463b7c6f45e5451e9083394 |
| Dakota H | S CHARLESTON, WV | Taylor | Mindie Rodriguez | already_sent | 440ea2d1a172fc0fc759f05530bbd10581b0daf7 |
| DaleAnna conklin | Kane, PA | Taylor | Mindie Rodriguez | already_sent | ec016025b784f8f07048bc344c208510bcb20e30 |
| Daniel C Schmader | Kane, PA | Taylor | Unassigned | already_sent | 9b9bac28e8ab1b470e43b45ed21645a544c9cc5a |
| Danielle Borum | PLYMOUTH, PA | Taylor | Mindie Rodriguez | already_sent | 65d8fd0e5f3e24a06383aa4bfca2a30068826814 |
| Darryl Hamby | Cleveland, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Darryl T. Williams | Hanover, MD | Recruiting Team | Melissa O'Connor | already_sent | d9d1b95ebccc7573c42d9dcb1b86969fe3b5efc9 |
| David Ezzi | Washington, PA | Taylor | Mindie Rodriguez | already_sent | 024072eae0e5ae467e08d3f671505e638cdc6375 |
| David Karp | Phoenix, AZ | Recruiting Team | Shelly Debellis | already_sent |  |
| DEAN B. SERGIACOMI | Millville, NJ | Recruiting Team | Melissa O'Connor | already_sent |  |
| Deane Hanna | Stuart, FL | Recruiting Team | Erin Boatright | already_sent |  |
| deannparker88@gmail.com |  | Recruiting Team | Lori VandeWiele | coverage_blocked |  |
| Deborah Mustico | CONWAY, SC | Recruiting Team | Erin Boatright | already_sent | e8b84a5bc53aa42a53652512fe87ed062bfc5f08 |
| Demarcus Lee Hamilton | Sumter, SC | Taylor | Erin Boatright | already_sent | 6a896682b2068948cc58beeebf3c7df0b283efdd |
| Denekeya Yancey | Nashville, NC | Casey | Erin Boatright | already_sent | 9370d8b73d49a511ade7bb0646a94829d4774588 |
| Denisha Caldwell | Chester, SC | Unassigned | Erin Boatright | already_sent | 5e29db4798646f23c0f70d28a1b04605f5b60803 |
| Derek Burpee | Fayetteville, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Derrick Fowler | Newark, OH | Taylor | Mindie Rodriguez | already_sent | 277371eb89447d489f48295978b173c4334fe95a |
| Desmund Stanley | Shallotte, NC | Recruiting Team | Erin Boatright | already_sent | d060e6cec12ece28196550638aae391c68eff8ca |
| destiniejones14@gmail.com |  | Unassigned | Unassigned | already_sent | 7b299d564b6b674b21b2e824c60e40c35a16f484 |
| Destiny Hunt | Lumberton, NC | Riley | Erin Boatright | already_sent | 2054c6dbc4b01fece1956a28c084445080e18ad8 |
| destrender1@gmail.com |  | Unassigned | Unassigned | already_sent | 14a4e6c0cc8dc99613a1c62fcd59d61f298434d2 |
| Diana Porter | PEMBROKE PINES, FL | Recruiting Team | Erin Boatright | already_sent | 1e1ba2f22a8550b1c8d14dc7434f2f913c08135f |
| Diandra Martinez | Dickinson, TX | Jordan | Amy Harp | already_sent | 4f61134b89fba513778937b82dd17f8585c460a1 |
| Diane Miller | CONWAY, SC | Recruiting Team | Erin Boatright | already_sent | ef11ee9041180703099c9db10f0d79684564d07a |
| Dianne DeThomaso | Cohasset, MA | Recruiting Team | Melissa O'Connor | already_sent | f5b97225fef0842b984a6369b51504e3f97c6c32 |
| Dominique Allen | Hattiesburg, MS | Unassigned | Erin Boatright | already_sent | 8d1676c4ec6cd293075b42c517a0c5ec9f483fe9 |
| Donald Peterson | Burgaw, NC | Unassigned | Erin Boatright | already_sent | 2543c8c988f2b76c8c04a0298c689fddd0145282 |
| dukekt928@yahoo.com |  | Unassigned | Unassigned | already_sent | 66ff209d4547586059003640328860262545d6a9 |
| Dylan Albright | Houghton Lake, MI | Taylor | Trista Thomas | already_sent | fb42a91abb579cea7fca4ec8907f1e36f64ef776 |
| e5139eb7ffd6 |  | Unassigned | Mindie Rodriguez | already_sent | 3da15924d8ceb2b616d3278160a3489071ff8c06 |
| e86a51691d13 |  | Unassigned | Amy Harp | already_signed | 36310d1bdf523dc4d869517c40e837ea8af33c8a |
| e96bcadec889 |  | Unassigned | Melissa O'Connor | already_sent | b80bf51a5b890c6fb57cb24799f4c7bf5265f4df |
| ebccc8110843 |  | Unassigned | Amy Harp | already_sent | 12e377def865f1b5234219c29877599dc1219205 |
| Ebone Washington | Conroe, TX | Recruiting Team | Amy Harp | already_sent | 2162e9fd9ad5b2ee45ac5ef612d5f3a99172aaf8 |
| ec67391a2162 |  | Unassigned | Trista Thomas | already_sent | 5dcf9b52487771f4d92d09e7ecc829107f2acf65 |
| edc9df960855 |  | Taylor | Lori VandeWiele | already_sent |  |
| ef8311c74516 |  | Unassigned | Amy Harp | already_sent | 7a6ada9f45f07e9b6ece73026de64bcfc1aa5e34 |
| Elana Rogers | Chiefland, FL | Riley | Erin Boatright | already_sent | b451cca3508d1c7299b57819ea02bdad90c5c2ff |
| Eldrick Lowery | Attalla, AL | Recruiting Team | Erin Boatright | already_sent |  |
| Elijah Bannerman | Burgaw, NC | Taylor | Unassigned | already_sent | e74981175127594eb8083484f06ec9c1b506c089 |
| Elise Claudy | Albuquerque, NM | Recruiting Team | Shelly Debellis | already_sent | c7dc4648bb8ade8402763c50093f95a11c7ef0bc |
| Elizabeth Odger | Lorton, VA | Recruiting Team | Mindie Rodriguez | already_sent | 904763d32e28d8089bb29a95eb2cf035c08954e9 |
| Elizabeth Seiwell | Woodlyn, PA | Taylor | Mindie Rodriguez | already_sent | 3e6dec1bd5a81da416014e3258a132ed8c48a88e |
| Emilio Cordova | Show Low, AZ | Unassigned | Shelly Debellis | already_sent | 73f28f6cae9f1edb01136418ad9928c54d24ab3e |
| Emily Conant Gilmartin | Hamilton, OH | Recruiting Team | Mindie Rodriguez | already_sent | 45e47317dc633ade3bab9b27bec66cac77f7ac0a |
| Eric Edward Lund | Gilbert, AZ | Recruiting Team | Shelly Debellis | already_sent | 06a972fa3c3f7023940edd0352495ce358e00e13 |
| Eric Green | PITTSBURG, KS | Recruiting Team | Amy Harp | already_sent | e82bb398e5981d464241c6271a39c694ad63c10e |
| Erica C Portolese | Massena, NY | Unassigned | Melissa O'Connor | already_sent | 4f4e0fc8cb7497d20760c1237b0e3f65947de17b |
| f1b2325774c4 |  | Unassigned | Unassigned | already_sent | 965bf5363290d225d5f79459d640405703a84f29 |
| f1f4a5fe9f5c |  | Unassigned | Amy Harp | already_signed | 07a339200b57f8bc790700aadba2ee1cd4c8162b |
| f6c222081b94 |  | Unassigned | Trista Thomas | already_sent | e3732cce3ed6fcb9e2daa808ef56118a05a9c104 |
| f786bc64011a |  | Unassigned | Melissa O'Connor | already_sent | 29a7ef7ae9ce871e0fb191446a477279eeada50f |
| f8bc83d66e0d |  | Taylor | Lori VandeWiele | already_sent |  |
| Faith Bandy | Youngstown, OH | Taylor | Mindie Rodriguez | already_sent | 867ca36e782f899834fced65bcbff0fe6ccf9ec7 |
| Faith Withem | Ontario, OR | Unassigned | Trista Thomas | already_sent | 3b193113cc740984cf6a139927c879c1a7a3fcf5 |
| Falisha Cobb | Bristol, VA | Taylor | Mindie Rodriguez | already_sent |  |
| fb06444d1348 |  | Unassigned | Melissa O'Connor | already_sent | 971c03ddb7d7ed2fb3dc70ac377ef7328897baf5 |
| fb3e7254d95a |  | Unassigned | Amy Harp | already_signed | 480aefacc9d8e01e37d4907131f038caaf80fabb |
| Felicia Lewis | Danville, IL | Taylor | Trista Thomas | already_sent | 4a9558c59e8b4e54a98d55669b8fe814cd3e8ffe |
| Gabriella Gandy | Starkville, MS | Recruiting Team | Erin Boatright | already_sent |  |
| Gabriella Langstone | Chapel Hill, NC | Riley | Erin Boatright | already_sent | 4151ca9bce47e6989c7bd90614995f5cc4bbffa5 |
| Garen Austin | Asheboro, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Garrett Exum | Dothan, AL | Unassigned | Erin Boatright | already_signed | 1699fffc1f9f53226beed14cadb6a436e56f0353 |
| Gary Smigocki | Woodbury, NJ | Unassigned | Melissa O'Connor | already_sent | 1edd6efb32d151bd0a1a046a3bb9ec393529e512 |
| Gianna DelGarbino | Youngstown, OH | Taylor | Mindie Rodriguez | already_sent |  |
| ginakaye33@hotmail.com |  | Unassigned | Unassigned | already_sent | b316deef8f6a7f90a26d7204b3588e6dbe2b5b36 |
| Glenn Carter | Fayetteville, NC | Unassigned | Erin Boatright | already_sent | 2298598a817eb3d49c6bcbfeb0f37f2e0b0a6888 |
| Grace Tolley | CONWAY, SC | Taylor | Erin Boatright | already_sent | 784d4e23e28a65c522b995608827c5d91441122c |
| gregory chaffin | Newark, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Gregory Petties | Brinkley, AR | Recruiting Team | Lori VandeWiele | already_sent |  |
| Gregory Petties | Brinkley, AR | Unassigned | Unassigned | already_sent | 22bb39129aee3b3d5cb57abfdb0993913570791b |
| Hannah Seitz | Ames, IA | Unassigned | Lori VandeWiele | already_sent | 4f0eef3656b4993707a2ea925b4d857a7bac8847 |
| Harryl Avery Jr | Jacksonville, IL | Taylor | Trista Thomas | already_sent | adde89370054f67c94fb4167b546813121555719 |
| HARVEY K | St. Augustine, FL | Recruiting Team | Erin Boatright | already_sent |  |
| Heidi Raisian | Meadville, PA | Taylor | Mindie Rodriguez | already_sent | 7f73aef8a90403f10f3da9243f9e8e43bc0d6bcb |
| Hicham Dhibi | St. Augustine, FL | Recruiting Team | Erin Boatright | already_sent |  |
| hoffmanca1024@gmail.com |  | Unassigned | Unassigned | already_sent | ead6713b66f9ec3ef459dd75ddade89fbf84b420 |
| iesha Pennington | Mattoon, IL | Alex | Trista Thomas | already_sent | 34e0c2cc265a01d32e30c12a99f6a9e9ca072c23 |
| Jade Brown | Pembroke, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Jalen Garner | Hattiesburg, MS | Recruiting Team | Erin Boatright | already_sent |  |
| Jalon Mccormick | Lumberton, NC | Taylor | Unassigned | already_sent | e4d892e9334a5e9bb8b9555fbe5970e5436d874c |
| James Broadbridge | Elk Grove, CA | Taylor | Shelly Debellis | already_sent | e709e0d8f0825211ae6f1645fa20f3b6d5c66dae |
| James Daniels | Columbia, SC | Recruiting Team | Erin Boatright | already_sent | dd283f6facf8844a1cc80b8d24fddebcc1c0f168 |
| James Day | Gilbert, AZ | Recruiting Team | Shelly Debellis | already_sent |  |
| James Henry | Kane, PA | Taylor | Mindie Rodriguez | already_sent | 69bbcf3e9cabcf527b5f10ab9b2c628f238b2f09 |
| James Peters | Danville, IL | Taylor | Trista Thomas | already_sent |  |
| James Peters | Mahomet, IL | Unassigned | Unassigned | already_sent | 39c6fb68fa7987ce29c5dfb774b1e91ac2529858 |
| JAMIAYH JOHNSON | Hattiesburg, MS | Taylor | Erin Boatright | already_sent | a409b2ebfd85d56953a03831d8f996d70c23550e |
| JAMIAYH JOHNSON | Laurel, MS | Taylor | Unassigned | already_sent | 575f7046d51f32347d90917a36869c1e913e597c |
| Jamie Bogden | Conroe, TX | Recruiting Team | Amy Harp | already_sent | 555e9dd6c79ef64fe3769d82ad5fb8ed89ea535f |
| Janet Mitchell | LEXINGTON, SC | Recruiting Team | Erin Boatright | already_sent | 6cbaabc05f203f83e2285623b8e735ef0795a6db |
| Janet Mitchell | Columbia, SC | Recruiting Team | Erin Boatright | already_sent | 7a80211400d9fda4b08bb600c98634389021e1cb |
| Jasmine Barber | Mayodan, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Jasmine Modeste | Stuart, FL | Recruiting Team | Erin Boatright | already_sent | b9751af5a49bda863dd62c0fa5cb3eba26456e3a |
| Javier Gutierrez | San Antonio, TX | Recruiting Team | Amy Harp | already_sent | acf5717e2dc27deb26f29d9521006b8fedeb3389 |
| Jayla Morton | Beaufort, SC | Riley | Erin Boatright | already_sent | 38b31f4712014b319693e950e4050c6390486bc5 |
| Jeffrey Keys | Evansville, IN | Recruiting Team | Lori VandeWiele | already_sent |  |
| Jennifer Walden | BABCOCK RANCH, FL | Riley | Erin Boatright | already_sent | 1b90054c216e80c0a144fe23c2008d394d035270 |
| Jeramiah Ortiz | Youngstown, OH | Taylor | Mindie Rodriguez | already_sent | 80bb9585c5eb249928453ff247820c4b50f952b3 |
| Jessica DeBoer | Pensacola, FL | Recruiting Team | Erin Boatright | already_sent |  |
| Jessica Revels | Pembroke, NC | Taylor | Unassigned | already_sent | fbf839822dbfde5e9c32b9da985c1a8d1819a865 |
| jkggwhite1971@gmail.com |  | Unassigned | Mindie Rodriguez | already_sent | 32a3cf53f36b78c86a91e6d48c4ba0bfe956ea11 |
| jmbohara@gmail.com |  | Unassigned | Unassigned | already_sent | b6ffb6b80c4b180decc414787fa74cdf51460bee |
| Joaquin Barajas | Scottsdale, AZ | Unassigned | Unassigned | already_sent | 0f81c2b4ff4be56c84cb1bebdccf6ba9d22ac3a8 |
| Jody Lambert | LYNCHBURG, VA | Recruiting Team | Mindie Rodriguez | already_sent | d1a20b831cc4f76c485e4f7e7490ade67b88c1a4 |
| Jody S. Donahe | Fort Dodge, IA | Recruiting Team | Lori VandeWiele | already_sent |  |
| JOHN SMITH | Manning, SC | Unassigned | Erin Boatright | already_sent | ee6abce072413a4e0e8536d0bd8a9b819f9f08bf |
| John Wiedenhofer Jr | Dunkirk, NY | Unassigned | Melissa O'Connor | already_sent | 6a8629dd24efc9d52c5d8ac3591abc6662018389 |
| Johnna Belton | CAMDEN, SC | Recruiting Team | Erin Boatright | already_sent | 4ef4c0acbddb507d6742f18f5b0003504b056f0a |
| Jonathan Tyrone McCray | Sumter, SC | Recruiting Team | Erin Boatright | already_sent | b289766e70c6b0ab3c63c1b4a7b947bb361ca34f |
| Joneshia Martina | MANKATO, MN | Recruiting Team | Lori VandeWiele | already_sent | ebdd3a21e38b98ef8be538e229b4a13d2ef69485 |
| Joseph Rice | Mansfield, OH | Recruiting Team | Mindie Rodriguez | already_sent |  |
| jpattison9412@gmail.com |  | Unassigned | Unassigned | already_sent | fc02e7cbcc54ca5620945ee23c39fc08b83980b3 |
| June Ann Stagen | Danville, IL | Recruiting Team | Trista Thomas | already_sent | 74bb8e226ee0e22f88677f1931b570af0eb35438 |
| Justice Newman | Hillsboro, OH | Recruiting Team | Mindie Rodriguez | already_sent | 98ba673dceebd22776b9afdc26f4d660ffbec85f |
| kaibusinessminded@gmail.com |  | Taylor | Lori VandeWiele | coverage_blocked |  |
| Kailie Ray | Campbellsville, KY | Unassigned | Lori VandeWiele | already_sent | 877a346dd1f1b04e2411c8d9e8348d81123a30c0 |
| KALA BONER | Ripley, WV | Recruiting Team | Mindie Rodriguez | already_sent | 4c7e1cb4ddf516f8550bd66e2799524cc60f1970 |
| Karen Adrian | Brandon, FL | Taylor | Erin Boatright | already_sent | 10f477a85187545a917226382a93dbb6503e732f |
| Karri Foster | Hattiesburg, MS | Recruiting Team | Erin Boatright | already_sent | 772aae48520d6b3dd0daac34526fe08dadeb46d6 |
| Kassy Stewart | Maysville, KY | Taylor | Lori VandeWiele | already_sent | 40c4dd3c67f99aae6d47bd652ebff3ac28327139 |
| Katelyn Coursey | SHEBOYGAN FALL, WI | Taylor | Lori District Manager | already_sent | 2add915ffd8b86211cbc026c62bb4d03f020e61f |
| Katherine Hafley | Campbellsville, KY | Unassigned | Lori VandeWiele | already_sent | 6b73853bdf743736823a233e74195c2c18b0cf72 |
| Katie Franklin | Taylorsville, NC | Recruiting Team | Erin Boatright | already_sent |  |
| keionda14@gmail.com |  | Unassigned | Unassigned | already_sent | 2ef6735eee91fdb91dd18dfe84e84ac9863aac47 |
| Keisha Collins | Locust Grove, GA | Recruiting Team | Erin Boatright | already_sent | 233f0fe6bb978937934b9dec40cc82930e513720 |
| Keith Rodgers | East Boston, MA | Recruiting Team | Melissa O'Connor | already_sent | 2f0db2920f11ab09295a046669a3aca58c7199c3 |
| Kelli Platt | Evansville, IN | Unassigned | Lori VandeWiele | already_sent | acb7d90d6359538eeff60c7adf927c1c13173920 |
| kelloyha@yahoo.com |  | Unassigned | Unassigned | already_sent | 9f6c7f9ef261bc011634caf7d90618b09af73b33 |
| Kelvin Stephens | Newberry, SC | Taylor | Erin Boatright | already_sent | 1b4fa5efe75f42462ce2f03dbb33394142969952 |
| Kendell pankey | Pembroke, NC | Taylor | Unassigned | already_sent | 47b4d5e40516d74577a6fe84fba51c456a0b970d |
| Kendra Chagnon | Starkville, MS | Taylor | Erin Boatright | already_sent | 9e383137b037b20e23f8b574cf9e42edd4fb46c7 |
| Kendra Triplett | S CHARLESTON, WV | Recruiting Team | Mindie Rodriguez | already_sent | a1331fb80dec27f38cc14595277a94d0470b6a93 |
| Kenneth Martin | Mount Sterling, KY | Recruiting Team | Lori VandeWiele | already_sent | 12b0493c5d1dc895b82342618619db605f4ddf26 |
| Khalif Muhammad | Whitman, MA | Taylor | Unassigned | already_sent | 1d1b9c07b79c5a5277b5c4a216d9894feab1ccfc |
| KIM BECKETT | Maysville, KY | Recruiting Team | Lori VandeWiele | already_sent | 1aba01d400595f4720b22c15ac63fd756ab97cf1 |
| Kimberly Swanson | Cleveland, OH | Recruiting Team | Mindie Rodriguez | already_sent |  |
| Kimberly Swanson | Cleveland, OH | Alex | Mindie Rodriguez | already_sent | d1acc10e364c114bebf3fb3682cf5b8007c9f6cd |
| Kimberly Swanson | MIDDLEBURG HEIGHTS, OH | Recruiting Team | Mindie Rodriguez | already_sent | de10d0664f5f1b71be1784273d6b21e24fec5337 |
| Kinnley Welch | Elizabeth City, NC | Recruiting Team | Erin Boatright | already_sent | c8152c09dcb1f5236db8ddb0b6d926d2ca046a60 |
| kmd1414@yahoo.com |  | Unassigned | Unassigned | already_sent | 7daab4e3166ada4640956c18d906c80a48c14ff7 |
| Korey Frenton | Pembroke, NC | Recruiting Team | Erin Boatright | already_sent | 22152fd39d7d3bedd7b634fb34f8324d115b63a3 |
| Kuuipo Bourne | Laredo, TX | Recruiting Team | Amy Harp | already_sent | 681b76e64570118e1b39292d59c346b507219b76 |
| Kyana Kamell Rigby | Attalla, AL | Recruiting Team | Erin Boatright | already_sent |  |
| Kyler Alholwani | Mahomet, IL | Recruiting Team | Trista Thomas | already_sent | 8ee770acfe5c90c93e29eab02462e49843baf8ad |
| Kynia Spriggs | Asheboro, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Lara Gh | Cleveland, OH | Unassigned | Mindie Rodriguez | already_sent | 9ca6e0bec9fb723e61505dd75efcbabff267eacd |
| LAROYA DAILEY | High Point, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Larry Johnson | Atlanta, GA | Recruiting Team | Erin Boatright | already_sent |  |
| Latisha Jacobs | Pembroke, NC | Recruiting Team | Erin Boatright | already_sent | 98ddb08249401be44704b0da423f879c487def04 |
| Latrace Bowers | Manning, SC | Recruiting Team | Erin Boatright | already_sent |  |
| Latrese Crump | Battle Creek, MI | Recruiting Team | Trista Thomas | already_sent | ff81bf240bc61ccc4d2654b61dedf1bc1ff7bc5e |
| Latriena Solomon | Sumter, SC | Taylor | Erin Boatright | already_sent | 825a4dfa5aa9a5cf33b6c802d04d869355d04f22 |
| laylaybrookins@gmail.com |  | Unassigned | Unassigned | already_sent | 28bb977d4a2479b4c9e06595a5ec9d9d889d7c15 |
| Leion Evins | Manning, SC | Unassigned | Erin Boatright | already_sent | f449f39d943bf90cc825c25e1b401ee039788f65 |
| Lela Davis | Attalla, AL | Recruiting Team | Erin Boatright | already_sent |  |
| Leonard Sutton | Wilkes Barre, PA | Taylor | Mindie Rodriguez | already_sent | 96c0b0313116b3cc6f947b99010c299d7672920e |
| Lethean Apsey | Pensacola, FL | Recruiting Team | Erin Boatright | already_sent |  |
| Lew Gabel | ASHTABULA, OH | Taylor | Mindie Rodriguez | already_sent | 6140d881767798b67c14a24b12e223f2e574df53 |
| Liaunda Lang | Rincon, GA | Recruiting Team | Erin Boatright | already_sent |  |
| Lindsay Norton | Whitestown, IN | Recruiting Team | Lori VandeWiele | already_sent | 19d82c9ae6cfae70e58436be09ffcb13040c482c |
| Lisa Aldridge | Spruce Pine, NC | Recruiting Team | Erin Boatright | already_sent | 67d8f49547429177461a4bc4c949dfd6614d49e6 |
| Lisa Miley | Valdosta, GA | Recruiting Team | Erin Boatright | already_sent | c0b0daef644b6e4cb9a3a8e86b65081a8a1a39cf |
| Lloyd (Ed) Vickrey | Elizabeth City, NC | Taylor | Erin Boatright | already_sent | d3b35a997a9ea6d835fd65c65dd868931c78cc5a |
| Lorena Retana | Phoenix, AZ | Taylor | Shelly Debellis | already_sent | 83b7c9df35ce1393e300189ba4bfdd76847218c5 |
| Lovett Roberts | Valdosta, GA | Recruiting Team | Erin Boatright | already_sent |  |
| M C | Princeton, WV | Taylor | Mindie Rodriguez | already_sent | 515b365ef3f514c90e8fd07ec41ff415db256741 |
| Madison Cavins | Portsmouth, OH | Recruiting Team | Mindie Rodriguez | already_sent | 599b29f7cbbee96626f0d64c90c717c436b92486 |
| Madison Hughes | Hillsboro, OH | Taylor | Mindie Rodriguez | already_sent | d0959466be1e34072a246496c4aba6ec7b03152e |
| Malcolm Cooper | Washington, PA | Unassigned | Mindie Rodriguez | already_signed | 2b403b2ea18f0698b5ad1c4d4bdc51a3ca788c1c |
| Margaret Bird | Fairfield, OH | Taylor | Mindie Rodriguez | already_sent | c570201f0f4d88ce9efdc04d79513531b94432c6 |
| Maria Bustamante | Laredo, TX | Recruiting Team | Amy Harp | already_sent | 9623b1707e774c51999b083aeb0eefc2f9310b2e |
| MARIANNA REGINA CULP | Lake Wylie, SC | Unassigned | Erin Boatright | already_sent | 08f88f7949ffb2dee8fce788b7277212b5a80ff2 |
| Marie Fann | Belleville, IL | Unassigned | Trista Thomas | already_sent | c18ef0c5ab472c5bb79d98166abb337e7bbf0c30 |
| Marie Kirkland | Valdosta, GA | Recruiting Team | Erin Boatright | already_sent |  |
| Mark Person | Woodbury, NJ | Unassigned | Melissa O'Connor | already_sent | 48710d6ce19749deee3893a9bd1fc2ca09822886 |
| Mark Ziegler | St. Augustine, FL | Unassigned | Erin Boatright | already_sent | 05b94ff0601e2b46b84665b23c86c2086732a212 |
| Marlene Joyce | West Mifflin, PA | Taylor | Mindie Rodriguez | already_sent | 0ab175f624f30fc818659c0b361fb788d7f5dc8a |
| MARY-BELLE ALLEN | Richlands, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Matthew Raddin | Spring, TX | Jordan | Amy Harp | already_sent | c7268d6df06eefefcd4dc3effadb4f5f430d8acb |
| Megan Pickens | S CHARLESTON, WV | Taylor | Mindie Rodriguez | already_sent |  |
| Megan Thomasson | Orangeburg, SC | Recruiting Team | Erin Boatright | already_sent |  |
| meganvillavaso2@gmail.com |  | Unassigned | Unassigned | already_sent | 456f74383f07ceee2ce522ab4ef63eed710b5529 |
| meghann summers | Vandalia, IL | Taylor | Trista Thomas | already_sent |  |
| Melinda Beth Haunpo | LAWTON, OK | Recruiting Team | Amy Harp | already_sent | 00680ae862cc3617f7e45cb6fef8e59f457eb334 |
| Melissa Calhoun | Sheffield Village, OH | Taylor | Mindie Rodriguez | already_sent |  |
| melissa lloyd | BABCOCK RANCH, FL | Unassigned | Unassigned | missing_recruiter |  |
| memewilliams1995@gmail.com |  | Unassigned | Unassigned | already_sent | a36ea8953a6760029669e1173e7b35c44fdcc41b |
| Mia Sturtevant | Peterborough, NH | Taylor | Melissa O'Connor | already_sent |  |
| MICHAEL CHALICH | JOHNSTOWN, PA | Taylor | Mindie Rodriguez | already_sent | 04036467c8ced6781f91d545652a986ead83ea08 |
| Michael Killingsworth | Dothan, AL | Unassigned | Erin Boatright | already_sent | a84ec0088c7c46b43973d32575f00b968d87e285 |
| MICHAEL MENDIOLA | Dickinson, TX | Recruiting Team | Amy Harp | already_sent | 236ff5276e28ca9739372232b885564914439c1e |
| Michelle MAROULIS | Pembroke, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Michelle Walker Kaczmarek | BABCOCK RANCH, FL | Taylor | Erin Boatright | already_sent | 0dd8985bf867ee8702d290d31514201f41d4e667 |
| mickeyunc2007@gmail.com |  | Unassigned | Unassigned | already_sent | 64b82bc5fe45ed6f7354f268c4bd916348224ea0 |
| Mike Pullins | Henderson, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Milica Pavia | Cleveland, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Miranda Luker | Terre Haute, IN | Logan | Lori VandeWiele | already_sent | e6293efebee0e44ab3ecae703afe7962d57c4604 |
| Mista Clark | Attalla, AL | Recruiting Team | Erin Boatright | already_sent |  |
| mjmwell@aol.com |  | Unassigned | Amy Harp | already_sent | 94f692a2f2cd4e9296cf6adff3cacac6b22a4519 |
| Monique Franklin | Mahomet, IL | Recruiting Team | Trista Thomas | already_sent |  |
| Mya Higgins | Oak Grove, KY | Recruiting Team | Lori VandeWiele | already_sent | 2bfa0f37a7b6a3332d8acbf6d9bc6d1ee16f49f7 |
| Naomi Harris | Pickens, SC | Recruiting Team | Erin Boatright | already_sent |  |
| Narlon Brown | Valdosta, GA | Recruiting Team | Erin Boatright | already_sent | a3950197b16c470150e3a6294b0591935a63a3f1 |
| Natasha Staton | Starkville, MS | Taylor | Erin Boatright | already_sent | 5c27cb8606a81d58da69160ee013b75c7433e922 |
| navi | JOHNSTOWN, PA | Recruiting Team | Mindie Rodriguez | already_sent | 8b761b5ab15b340c4dcd3d3aede489859da2bc72 |
| Nevaeh Amaker | Wilkes Barre, PA | Recruiting Team | Mindie Rodriguez | already_sent | 9d13099f6a1bc207932d0d08a44c78612f5bc0dd |
| Nevaeh cunningham | Oak Grove, KY | Recruiting Team | Lori VandeWiele | already_sent | 029ce81b7f28a858872c7dda16201461b8a83792 |
| Nevaeh Johnson | Chandler, AZ | Recruiting Team | Shelly Debellis | already_sent | 07b7453fb68c8f86bc7c8856bc8987b84bd6f45f |
| Nick Tolliver | MEDIA, PA | Taylor | Mindie Rodriguez | already_sent | 887a2b43cdacad36687371d310f05c6979d40880 |
| Nikita Gagum | CONWAY, SC | Recruiting Team | Erin Boatright | already_sent | 7aec4c02fe5e5e914d21535e318bac659a23be24 |
| Niurka C Contreras | PEMBROKE PINES, FL | Taylor | Erin Boatright | already_sent | 8350be7f7ce979fd00701250dd92b5dfc43245da |
| Norah Jones | Starkville, MS | Recruiting Team | Erin Boatright | already_sent |  |
| Nykol Tindle | Columbus, OH | Taylor | Mindie Rodriguez | already_sent |  |
| OCKERT VENTER | Cleveland, OH | Taylor | Mindie Rodriguez | already_sent | 67d8ea3b0a3546db5573f6cba64f9745c0671f96 |
| oppenheimjill@nextstepcareer.net |  | Unassigned | Unassigned | already_sent | 514eea278291eb037ea3b88f2df86d9aa7e78c82 |
| Patricia Irby | Lake Havasu City, AZ | Recruiting Team | Shelly Debellis | already_sent |  |
| Patrick Berry | Dorchester, MA | Recruiting Team | Melissa O'Connor | already_sent |  |
| Phillip Bailey | Hillsboro, OH | Taylor | Mindie Rodriguez | already_sent | 74606e96e94d4bf249b540972473d7c6007c33c7 |
| Pricilla Thomas | Taylorsville, NC | Unassigned | Erin Boatright | already_sent | 8bb44c9a3f2ff1daaa2c2c70f6caeea0b7fe75b8 |
| Priya Nain | Stoughton, MA | Recruiting Team | Melissa O'Connor | already_sent | b8b8e919653e22cdb1f4d12f5d749be695980e7c |
| Quantamia Howard | Pembroke, NC | Taylor | Unassigned | already_sent | 25f9009e6a4c3b5ae35627fb7b3a40f46cb6bc2d |
| Rachel Gollahon | West Chester, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Rachel Gollahon | Fairfield, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Ramon Johnson | Lumberton, NC | Riley | Erin Boatright | already_sent | 72cb59ebfdd07c353645ba77b5f7e5cf88768e45 |
| Randi Whiteaker | Scottsdale, AZ | Unassigned | Unassigned | already_sent | f81f8ac91136bdc5e4b756982f1ae14f4695ef9d |
| Randy Bunting | Mahomet, IL | Taylor | Trista Thomas | already_sent | f31f64ca349567f27d44f1b4c3e93669c42b4428 |
| Rashekee Grimes | Barnwell, SC | Taylor | Erin Boatright | already_sent | 93ec701409d5f07b147d259918007ca2f2cf1bdd |
| Rashund Joyner -Googe | Orangeburg, SC | Recruiting Team | Erin Boatright | already_sent | 0176fd4bc4bafa53f7fd878eda57b9a1a4d85b13 |
| Reagan Robinson | Hattiesburg, MS | Recruiting Team | Erin Boatright | already_sent | c9a03858e804cbb6a3368626b36e53c3dadba218 |
| Rebecca Terry | PITTSBURG, KS | Recruiting Team | Amy Harp | already_sent |  |
| Rebekah Hoover | Taylor, AZ | Recruiting Team | Shelly Debellis | already_sent |  |
| Rhianna Pence | Ozark, AL | Recruiting Team | Erin Boatright | already_sent |  |
| Rhonda Castillo | Phoenix, AZ | Unassigned | Unassigned | already_sent | 384ddaf55f14cce311e991f6571129e4df642401 |
| Richard Anthony Orosco | Ontario, OR | Unassigned | Trista Thomas | already_sent | aa5e962422c5a6f18ff86fbf58ace3122361d387 |
| Richard Hayes | Pembroke, NC | Unassigned | Erin Boatright | already_sent | 175df24bae8f1c12a90a5a9744707fe8ab81b881 |
| Richard Karr | Chiefland, FL | Recruiting Team | Erin Boatright | already_sent |  |
| Rimah Malley | Frankfort, IL | Unassigned | Trista Thomas | already_sent | a376b5c5917538f93a4c0c2855f3e21cf20d6900 |
| Robert Shaw | Conroe, TX | Recruiting Team | Amy Harp | already_sent | d8c79d18fc52d452ad4704b2e7058d87feaeb25f |
| Robert Stutts | Dickinson, TX | Recruiting Team | Amy Harp | already_sent | e2fd88bbc5f8d9cdeb5c8e645e4a7f6fc1d2241f |
| rochellel2006@gmail.com |  | Unassigned | Unassigned | already_sent | 7054baa10d6b27f3729b7b216c5dd5d085fe3be7 |
| Rocio Solis | Laredo, TX | Recruiting Team | Amy Harp | already_sent | c4a09013d734737516ae23074b10165e45a42c51 |
| Rodney Morris | PHILADELPHIA, PA | Taylor | Mindie Rodriguez | already_sent | 270fc1d8e6cd31e97cc1829a29d5cc99fa56f0fd |
| Roger Isaac | Barnwell, SC | Recruiting Team | Erin Boatright | already_sent | 3bef10bfcffbcb06141e0e9c6684ddcd701a56e0 |
| Rohit Mynam | Watertown, MA | Taylor | Unassigned | already_sent | 7881b62c10f111027632c2f0ab5ff395138db842 |
| Rommel Suba | Gilbert, AZ | Taylor | Shelly Debellis | already_sent | 121745b0fcb8e7b626ef0126d11941093217e349 |
| Ronald Gager | Oak Grove, KY | Recruiting Team | Lori VandeWiele | already_sent | ccb3b59364d2995338091a3cea1a11da91fc4afa |
| ronaldboutte35@topcandidate.co |  | Unassigned | Unassigned | already_sent | 1ef56672ac14d01f2195e24e5fe02e2bd5bb82bd |
| Rondell Caudle | Mahomet, IL | Taylor | Trista Thomas | already_signed |  |
| Ruth Bellmore | Gilbert, AZ | Recruiting Team | Shelly Debellis | already_sent |  |
| Ruth Valdez | El Paso, TX | Recruiting Team | Amy Harp | already_sent | 15e3965a1487cab9ff2ac6605c5373808ed0e5ed |
| Ryan dinovo | Bluefield, WV | Taylor | Mindie Rodriguez | already_sent | 9ffa08caf11d404b66f701e455f122dc8bac1ae3 |
| Ryan J Campbell | Westminster, MD | Recruiting Team | Melissa O'Connor | already_sent |  |
| Ryan Pease | Houghton Lake, MI | Taylor | Trista Thomas | already_sent | 1490a30e4e8271e7b96fac771fb31502491f24f0 |
| Ryley Umbel | Washington, PA | Unassigned | Mindie Rodriguez | already_sent | a4ddf042161a6d5f564f588d06765cbb0d43f4fc |
| Sabin Subba | Carlisle, PA | Taylor | Mindie Rodriguez | already_sent | 8517c8096d94cac500e62cd1b99a6f2a6310b88f |
| saepmg49@gmail.com |  | Unassigned | Amy Harp | already_sent | d052b9329bc03265231929af5d04348b67efb6a2 |
| Samantha Bland | Starkville, MS | Taylor | Erin Boatright | already_sent | c814d55978007c703d8721d80b81033e2eddc246 |
| Samantha Trent | Mount Sterling, KY | Recruiting Team | Lori VandeWiele | already_sent |  |
| sameer.mar3i@icloud.com |  | Unassigned | Unassigned | already_sent | 5959f38531ec4434e121fdae440fb9cd29b5f962 |
| Sarah Little | High Point, NC | Taylor | Unassigned | already_sent | 3e9be01c2e1d34f46de3e0a2397ea312a796bc09 |
| Selena Serrano | Evansville, IN | Recruiting Team | Lori VandeWiele | already_sent | 7b3f725aa2753735e96f70c566c8148ee71a2977 |
| Sequoya Clark | Pembroke, NC | Recruiting Team | Erin Boatright | already_sent | 6a3e73f3b4247a561cf5f5c932a80c2fb36153af |
| Shanyn Pough | CAYCE, SC | Casey | Erin Boatright | already_sent | d11de46c31b4a5b36400c0c7801e2906a38ffe58 |
| ShaQuana Bracey | CAYCE, SC | Taylor | Erin Boatright | already_sent | cb5aadf0778c911c5bd4ab9a1c79f6593c8ddfea |
| Shayla Byron | Raeford, NC | Taylor | Unassigned | already_sent | cda27f7b59cfd0e0e96b88d24c2867877e0c2bea |
| Sheila R Southard | Brinkley, AR | Recruiting Team | Lori VandeWiele | already_sent | c9d228519f4f19a4e0e5cf26835dd1bf3ad57dee |
| Sherika White | Tifton, SC | Taylor | Unassigned | already_sent | 003c0becb48d8fe83c67f7ff60079e21ad3c7a0c |
| SHERRI L TAYLOR | CAYCE, SC | Recruiting Team | Erin Boatright | already_sent | 201e8a5ec7accd1809ce4c35d919cca649817ce2 |
| SHONTA ALLEN | Goldsboro, NC | Recruiting Team | Erin Boatright | already_sent | c94b9cbf1edb8ab2118283a0518188776506d549 |
| Skyela Banse-Fay | DUNKIRK, NY | Recruiting Team | Melissa O'Connor | already_sent | 462c23735157d2de903927db9d2e39f94e6e9b20 |
| Stacey V | Pickens, SC | Taylor | Unassigned | already_sent | 683e3cc65acd35dd2e97fbc32892eceb38d2d960 |
| Stacy Hunt | Pembroke, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Stephen Brooks | LAWTON, OK | Recruiting Team | Amy Harp | already_sent | ac2a78bd267e08c371b32acd3fb87d11ccd21c91 |
| Steven Craven | PITTSBURGH, PA | Unassigned | Unassigned | already_sent | 4f7fa53aa1a323c90f3df72b7f812b93420731ae |
| Steven Matthews | Burgaw, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Stuart Davis | Henderson, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Susan Spinks | Attalla, AL | Riley | Erin Boatright | already_sent | f243b4ae51f6f7d13c96f21a7bab04eed82246d7 |
| Susan Ward | Chiefland, FL | Recruiting Team | Erin Boatright | already_sent | 0ee51d04fda31ec42c9a07acdf50f83d98769c53 |
| Syakhiah Clarke | Carlisle, PA | Recruiting Team | Mindie Rodriguez | already_sent |  |
| Taeshia Stevens | Union, SC | Taylor | Erin Boatright | already_sent | c3d26a431847191d137e5259894b5cbe7104d642 |
| Talayah Battle | Nashville, NC | Recruiting Team | Erin Boatright | already_sent |  |
| Tamiyiah mccarty | Hattiesburg, MS | Taylor | Erin Boatright | already_sent | 55678f1c05f7a75614fa7ea0f25a1beb89dc1b38 |
| Tammy Benton | Staunton, VA | Taylor | Mindie Rodriguez | already_sent | d8714c3dc2c941a7c608cd8e6b03b1b7a066b2f2 |
| taranehom@swiftemail.co |  | Unassigned | Unassigned | already_sent | ddbb7194ce5ca9397c916597c62f924ee70f09c2 |
| tariah.monea@icloud.com |  | Unassigned | Unassigned | already_sent | 830f220a1665887e04e701e75db903ff707157ae |
| Tasha Early | Lancaster, SC | Recruiting Team | Erin Boatright | already_sent |  |
| Tawnee Hoffman | Belleville, IL | Recruiting Team | Trista Thomas | already_sent | 75d8c67610c25b2044790487cba0054d879d1702 |
| Taylor Custenborder | West Chester, OH | Taylor | Mindie Rodriguez | already_signed |  |
| Tayvon McKoy | Raeford, NC | Taylor | Unassigned | already_sent | 044b4047e9a0c620ebbf046fd00fee4cd79bbfc0 |
| Terrel Andrews | Washington, PA | Unassigned | Mindie Rodriguez | already_sent | f9180e35fbdc03c19522a7efee1e39068fe5bd52 |
| Terrence Alford | Lumberton, NC | Taylor | Unassigned | already_sent | 10e647a6e5a6fcda6573ca13a64ea43f22e752c6 |
| Terry Bryant | Union, SC | Recruiting Team | Erin Boatright | already_sent |  |
| thegrinchracing@gmail.com |  | Unassigned | Unassigned | already_sent | 39010aa11a96dfe6eaeacfc91c73a7dc0d4cfed2 |
| Theo Johnson | Atlanta, GA | Recruiting Team | Erin Boatright | already_sent |  |
| Theodore Edward Winters | Wilkes Barre, PA | Taylor | Mindie Rodriguez | already_sent | 2c23d22655a39c6c720cfc5aad0e70f67fc4aad2 |
| Theresa Holdsworth | Meadville, PA | Taylor | Mindie Rodriguez | already_sent | 19e837904e39535e8f0c70d2e009b8cdf4247418 |
| Thomas Hafley | MIDLAND, MI | Recruiting Team | Trista Thomas | already_sent | 396af49ee495e99f735394d04c8d942588bd9b6b |
| tidwellbob1988@gmail.com |  | Unassigned | Unassigned | already_sent | 36e096affa5da892b8956e96f172f6ae34d7963f |
| Tiffany Locklear | Pembroke, NC | Taylor | Unassigned | already_sent | 77773383b191c780bf87992f3d7b4a2349ac8c70 |
| tightrope115@gmail.com |  | Unassigned | Unassigned | already_sent | 4f3d27caeffcbfd1b35861bfe922118c86f085fd |
| Tim Griffin | Valdosta, GA | Recruiting Team | Erin Boatright | already_sent |  |
| Timasia Tillis | Ozark, AL | Recruiting Team | Erin Boatright | already_sent | 872d946a76f5115e6783e1e0d66d2f2b635a6784 |
| Tina McMillan | CAMPBELLSVILLE, KY | Recruiting Team | Lori VandeWiele | already_sent | f652ee977ad65ba050fdd0cb5ce09a746c2516f5 |
| tlynn1531@icloud.com |  | Unassigned | Unassigned | already_sent | 1ef7d72ad341c8bc825a25698b4a424403aba58c |
| Tom Zimmerman | Akron, OH | Taylor | Mindie Rodriguez | already_sent |  |
| TOMMY EDWARD HARPER JR | Midland, MI | Taylor | Trista Thomas | already_sent | c5144af5e9e1300655418f368c74704e20ee4798 |
| torreyshaeallen@gmail.com |  | Unassigned | Unassigned | already_sent | b87aa687c275ffe5b082933ba972b71e4af6e755 |
| Tracey Sparks | Milford, OH | Taylor | Mindie Rodriguez | already_sent |  |
| Tracy Ann Higdon | PLYMOUTH, PA | Taylor | Mindie Rodriguez | already_sent | c70d0e0adaaf2ff9788f53073884a3dbe54bbb90 |
| Tracy Hedderman | PEMBROKE PINES, FL | Recruiting Team | Erin Boatright | already_sent | 9f15cd23853cac417208b93b9e43b440c0647c9f |
| Tracy Hicks | Brinkley, AR | Taylor | Lori VandeWiele | already_sent | 6af975982ff1ccb0b510e43f3f59f3e707a2f031 |
| Tracy Lendyok | Phoenix, AZ | Recruiting Team | Shelly Debellis | already_sent | c2d89314e98209314c4d9e0643f245d30575d370 |
| travisdelane23@gmail.com |  | Unassigned | Unassigned | already_sent | 3169bde77759f6d6195911df83a914e9a083f3f4 |
| Travtanasia | Valdosta, GA | Unassigned | Erin Boatright | already_sent | c833f8d364f3025ebdd3a77190c1c7ceb4f6f255 |
| TUREYA DANCER | Phoenix, AZ | Taylor | Shelly Debellis | already_sent | ac5410c360d63da897f7c5c3ed00396f66b973d7 |
| Tyera Anderson-Rainey | NEW CASTLE, PA | Taylor | Mindie Rodriguez | already_sent |  |
| Tyera Anderson-Rainey | Springfield, PA | Taylor | Mindie Rodriguez | already_sent | 8cfc2c001f10b7b3d79b17fe1bbb4ace2d13f133 |
| Tyesha Evans | Washington, PA | Unassigned | Mindie Rodriguez | already_sent | 736f44ecbd65d432194fa0868a064f9e4bfd4780 |
| Tyla Richard | Boutte, LA | Casey | Erin Boatright | already_sent | 2ea339db2154a428d675142d228b5104ff8bab90 |
| Tyler Gray | Princeton, WV | Recruiting Team | Mindie Rodriguez | already_sent |  |
| Tyraya Rena Robertson | Evansville, IN | Recruiting Team | Lori VandeWiele | already_sent | 970bd6f466a9246cb0c0bf1cb5aa81b7ef2ee165 |
| Tyuna Brumfield | Hattiesburg, MS | Recruiting Team | Erin Boatright | already_sent | 707f1aa510a0d5e8552d1e58d88f2a17ac7e65c9 |
| Valine Cline | Newark, OH | Alex | Mindie Rodriguez | already_sent | 893ef7d1d8092470519a7b6ff075853e6e4b8995 |
| Victoria | El Paso, TX | Taylor | Amy Harp | already_sent | 7306252e6bb543f9a7224ae3df0d1c7ed6028186 |
| Virginia Berry | Maysville, KY | Recruiting Team | Lori VandeWiele | already_sent | c992d11a539048bbd8231276c68e9ef84c49b35e |
| Wade Chavis | Raeford, NC | Unassigned | Erin Boatright | already_sent | 341faf0281ad2d8b555a10ffb9751911e885e6eb |
| William Fields | Lumberton, NC | Recruiting Team | Erin Boatright | already_sent | ad8d3fc075bf7f94a5b3485028ee5ce7db492448 |
| William Gustafson | Arcadia, FL | Recruiting Team | Erin Boatright | already_sent |  |
| writerslave@gmail.com |  | Unassigned | Unassigned | already_sent | c63370cf0458f95813d7af78ebff402d2ff83668 |
| Yasha Thompson | Valdosta, GA | Recruiting Team | Erin Boatright | already_sent | 6bbcc8470bd664f0e3307c93d19d95b4aa3a1360 |
| Yasmeen Flowers | Starkville, MS | Taylor | Erin Boatright | already_sent | dab060f1e2b7af6b190635968b203f83c269974e |
| Yolanda Tolson | Goldsboro, NC | Taylor | Erin Boatright | already_sent | c60f5665a68f8f3a8496d430c98fa4e55ac27f55 |
| Yvette Sumter-Rawls | Columbia, SC | Taylor | Erin Boatright | already_sent | 72ffa7412de476246f6c767da6d37c71e343394b |
| Yvette Sumter-Rawls | CAYCE, SC | Taylor | Erin Boatright | already_sent | 1ff5e77912b4b92a1115e01fa36bb25ac4f4554d |
| Yvonne Shields | NEWPORT NEWS, VA | Recruiting Team | Mindie Rodriguez | already_sent | ce5ba4aba9b5afb8e31be7b7ab5df41ef2ce81c2 |
| zae.valentin@gmail.com |  | Unassigned | Unassigned | already_sent | 64520c408a5cfa10b559bbd1938a78d6e14246e7 |
| Zechari McCree | INDIANAPOLIS, IN | Taylor | Lori VandeWiele | already_sent | 25fec41c7431ac8ab77dd9b3a2dba3c35d16c3fe |

## Safety

- Live mode authorized: true
- Production Dropbox only: true
- Simulated sends: 0
- Reminder emails sent: 0
- MEL writes: 0
- Breezy stage writes: 0
- Duplicate-creating retries: 0

## Artifacts

- `artifacts/p253-live-send.json`
- `artifacts/p253-live-send-summary.md`
