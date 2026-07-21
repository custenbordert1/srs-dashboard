import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachLivePositionIds,
  matchOpensToBreezyPosts,
  sortOpensByApplicantCount,
} from "@/lib/open-stores-paperwork-send/match-opens-to-breezy";
import {
  cityStateFromPositionName,
  fuzzyCityScore,
  isApplicantYes,
  normalizeCity,
  normalizeState,
  parseCityState,
  sanitizeSpecialChars,
} from "@/lib/open-stores-paperwork-send/normalize";
import {
  opensWithApplicants,
  parseBreezyPostsSheet,
  parseOpensSheet,
} from "@/lib/open-stores-paperwork-send/parse-workbook";
import {
  buildApplicantsPerStore,
  buildReportTotals,
  buildTopStoresByApplicants,
  formatOpenStoresPaperworkStdout,
} from "@/lib/open-stores-paperwork-send/format-report";
import {
  buildApplicantTrackingList,
  mapOutcomeToStatus,
  tallyApplicantTracking,
} from "@/lib/open-stores-paperwork-send/build-applicant-tracking";
import {
  assertForceAutoAdvanceAllowed,
  FORCE_AUTO_ADVANCE_WARNING,
} from "@/lib/open-stores-paperwork-send/force-auto-advance";
import type { BreezyJob } from "@/lib/breezy-api";
import type { OpenStoresPaperworkSendReport } from "@/lib/open-stores-paperwork-send/types";

describe("open-stores-paperwork-send normalize", () => {
  it("detects Applicant Yes variants", () => {
    assert.equal(isApplicantYes("Yes"), true);
    assert.equal(isApplicantYes("yes"), true);
    assert.equal(isApplicantYes("No"), false);
    assert.equal(isApplicantYes(""), false);
  });

  it("sanitizes Unicode dashes, curly quotes, and mojibake", () => {
    // En/em dashes and mojibake collapse to ASCII hyphen
    assert.equal(sanitizeSpecialChars("A – B"), "A - B");
    assert.equal(sanitizeSpecialChars("A — B"), "A - B");
    assert.equal(sanitizeSpecialChars("A ‚Äì B"), "A - B");
    assert.equal(sanitizeSpecialChars("O\u2019Brien"), "O'Brien");
    assert.equal(sanitizeSpecialChars("\u201Cquoted\u201D"), '"quoted"');
  });

  it("parses city/state from location and position names with dash variants", () => {
    assert.deepEqual(parseCityState("Oak Grove, KY"), {
      city: normalizeCity("Oak Grove"),
      state: "KY",
    });
    assert.deepEqual(cityStateFromPositionName("Retail Merchandiser – Oak Grove, KY"), {
      city: normalizeCity("Oak Grove"),
      state: "KY",
    });
    assert.deepEqual(cityStateFromPositionName("Retail Merchandiser ‚Äì Oak Grove, KY"), {
      city: normalizeCity("Oak Grove"),
      state: "KY",
    });
    assert.deepEqual(cityStateFromPositionName("Retail Merchandiser - Oak Grove, KY"), {
      city: normalizeCity("Oak Grove"),
      state: "KY",
    });
    assert.equal(normalizeState("fl"), "FL");
  });

  it("scores fuzzy city matches", () => {
    assert.equal(fuzzyCityScore("Oak Grove", "Oak Grove"), 1);
    assert.ok(fuzzyCityScore("Pembroke Pines", "Pembroke") >= 0.55);
    assert.ok(fuzzyCityScore("SHEBOYGAN FALL", "Sheboygan Falls") >= 0.45);
    assert.equal(fuzzyCityScore("Oak Grove", "Goldsboro"), 0);
  });
});

describe("open-stores-paperwork-send parse + match", () => {
  it("parses Opens and filters Applicant=Yes", () => {
    const opens = parseOpensSheet([
      {
        "Project No": "1106086",
        "Project Name": "Trends Tier 1",
        City: "Oak Grove",
        "State/Province": "KY",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 3,
        "District Manager": "Lori",
      },
      {
        "Project No": "999",
        City: "Nowhere",
        "State/Province": "TX",
        "Applicant (Yes/No)": "No",
      },
    ]);
    assert.equal(opens.length, 2);
    assert.equal(opensWithApplicants(opens).length, 1);
    assert.equal(opens[0]!.applicantCount, 3);
  });

  it("ranks opens by applicant count descending", () => {
    const opens = parseOpensSheet([
      {
        City: "A",
        "State/Province": "TX",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 1,
      },
      {
        City: "B",
        "State/Province": "TX",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 8,
      },
      {
        City: "C",
        "State/Province": "TX",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 3,
      },
    ]);
    const ranked = sortOpensByApplicantCount(opensWithApplicants(opens));
    assert.deepEqual(
      ranked.map((r) => r.city),
      ["B", "C", "A"],
    );
  });

  it("matches Opens to Breezy Posts by city/state and rejects wrong-state collisions", () => {
    const opens = parseOpensSheet([
      {
        City: "PEMBROKE PINES",
        "State/Province": "FL",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 3,
        "Project Name": "Trends",
        "Project No": "1",
      },
      {
        City: "Oak Grove",
        "State/Province": "KY",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 3,
        "Project Name": "Trends",
        "Project No": "2",
      },
    ]);
    const posts = parseBreezyPostsSheet([
      {
        State: "Active",
        Name: "Merchandiser Needed ‚Äì Pembroke",
        Location: "Pembroke, NC",
        Candidates: 14,
      },
      {
        State: "Active",
        Name: "Retail Service Merchandiser ‚Äì Pembroke Pines, FL",
        Location: "PEMBROKE PINES, FL",
        Candidates: 3,
      },
      {
        State: "Active",
        Name: "Retail Merchandiser – Oak Grove, KY",
        Location: "Oak Grove, KY",
        Candidates: 3,
      },
    ]);

    const matches = matchOpensToBreezyPosts({
      opens: opensWithApplicants(opens),
      breezyPosts: posts,
    });

    assert.equal(matches.length, 2);
    assert.equal(matches[0]!.confidence, "exact_location");
    assert.match(matches[0]!.breezyPost!.name, /Pembroke Pines/i);
    assert.equal(matches[1]!.confidence, "exact_location");
    assert.match(matches[1]!.breezyPost!.name, /Oak Grove/i);
  });

  it("fuzzy-matches near-identical city spellings", () => {
    const opens = parseOpensSheet([
      {
        City: "SHEBOYGAN FALL",
        "State/Province": "WI",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 1,
      },
    ]);
    const posts = parseBreezyPostsSheet([
      {
        State: "Active",
        Name: "Retail Merchandiser – Sheboygan Falls, WI",
        Location: "Sheboygan Falls, WI",
        Candidates: 1,
      },
    ]);
    const matches = matchOpensToBreezyPosts({
      opens: opensWithApplicants(opens),
      breezyPosts: posts,
    });
    assert.ok(matches[0]!.breezyPost);
    assert.ok(
      matches[0]!.confidence === "exact_location" ||
        matches[0]!.confidence === "city_only" ||
        matches[0]!.confidence === "name_location",
    );
  });

  it("attaches live positionIds via name matcher", () => {
    const opens = parseOpensSheet([
      {
        City: "Oak Grove",
        "State/Province": "KY",
        "Applicant (Yes/No)": "Yes",
        "Project Name": "Trends",
      },
    ]);
    const posts = parseBreezyPostsSheet([
      {
        State: "Active",
        Name: "Retail Merchandiser – Oak Grove, KY",
        Location: "Oak Grove, KY",
        Candidates: 3,
      },
    ]);
    const matches = matchOpensToBreezyPosts({
      opens: opensWithApplicants(opens),
      breezyPosts: posts,
    });
    const jobs: BreezyJob[] = [
      {
        jobId: "job-oak-1",
        name: "Retail Merchandiser – Oak Grove, KY",
        city: "Oak Grove",
        state: "KY",
        zip: "42262",
        displayLocation: "Oak Grove, KY",
        locationSource: "location.city+location.state",
        status: "published",
        createdDate: "",
        updatedDate: "",
      },
    ];
    const withIds = attachLivePositionIds(matches, jobs);
    assert.equal(withIds[0]!.positionId, "job-oak-1");
  });

  it("marks near-ties as ambiguous", () => {
    const opens = parseOpensSheet([
      {
        City: "MIDLAND",
        "State/Province": "MI",
        "Applicant (Yes/No)": "Yes",
        "Project Name": "Trends",
      },
    ]);
    const posts = parseBreezyPostsSheet([
      {
        State: "Active",
        Name: "Retail Merchandiser – MIDLAND, MI",
        Location: "MIDLAND, MI",
        Candidates: 2,
      },
      {
        State: "Active",
        Name: "Retail Merchandiser Alt – MIDLAND, MI",
        Location: "MIDLAND, MI",
        Candidates: 2,
      },
    ]);
    const matches = matchOpensToBreezyPosts({
      opens: opensWithApplicants(opens),
      breezyPosts: posts,
    });
    assert.equal(matches[0]!.confidence, "ambiguous");
    assert.equal(matches[0]!.breezyPost, null);
  });
});

describe("open-stores-paperwork-send summary formatting", () => {
  it("builds top stores and totals for human summary", () => {
    const opens = parseOpensSheet([
      {
        City: "CAYCE",
        "State/Province": "SC",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 8,
      },
      {
        City: "Oak Grove",
        "State/Province": "KY",
        "Applicant (Yes/No)": "Yes",
        "How many if yes": 3,
      },
    ]);
    const posts = parseBreezyPostsSheet([
      {
        State: "Active",
        Name: "Retail Coverage Merchandiser – CAYCE, SC",
        Location: "CAYCE, SC",
        Candidates: 8,
      },
      {
        State: "Active",
        Name: "Retail Merchandiser – Oak Grove, KY",
        Location: "Oak Grove, KY",
        Candidates: 3,
      },
    ]);
    const matches = matchOpensToBreezyPosts({
      opens: sortOpensByApplicantCount(opensWithApplicants(opens)),
      breezyPosts: posts,
    });
    const applicantsPerStore = buildApplicantsPerStore({ matches, cycle: null });
    const top = buildTopStoresByApplicants(applicantsPerStore, 5);
    assert.equal(top[0]!.city, "CAYCE");
    assert.equal(top[0]!.applicantCount, 8);

    const totals = buildReportTotals({
      matches,
      applicantsPerStore,
      cycle: null,
      canaryLimit: 5,
      dryRun: true,
    });
    assert.equal(totals.totalSheetApplicants, 11);
    assert.equal(totals.estimatedPaperworkSends, 11);

    const report = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      xlsxPath: "/tmp/Trends_Posts_With_Applicants..xlsx",
      mode: "dry_run",
      dryRun: true,
      confirmLive: false,
      canaryLimit: 5,
      forceFreshReset: false,
      forceAutoAdvance: false,
      forcedAutoAdvanceCount: 0,
      opensWithApplicants: 2,
      totalSheetApplicants: totals.totalSheetApplicants,
      totalQualifiedApplicants: totals.totalQualifiedApplicants,
      estimatedPaperworkSends: totals.estimatedPaperworkSends,
      topStoresByApplicants: top,
      matchedOpens: 2,
      unmatchedOpens: 0,
      ambiguousOpens: 0,
      uniquePositionIds: 0,
      positionIds: [],
      applicantsPerStore,
      applicants: [],
      applicantTally: { planned: 0, sent: 0, skipped: 0, qualifiedAdvanced: 0, forcedAutoAdvance: 0 },
      totalPaperworkPlanned: 0,
      totalPaperworkSent: 0,
      totalFailures: 0,
      failures: [],
      cycle: null,
      notes: [],
      warnings: [],
    } satisfies OpenStoresPaperworkSendReport;

    const out = formatOpenStoresPaperworkStdout(report);
    assert.match(out, /Stores with applicants:\s+2/);
    assert.match(out, /Total sheet applicants:\s+11/);
    assert.match(out, /Estimated paperwork sends:\s+11/);
    assert.match(out, /Top 5 stores by applicants/);
    assert.match(out, /CAYCE, SC/);
    assert.doesNotMatch(out, /Applicants Processed/);
  });

  it("maps P243 outcomes into applicant tracking and prints with --show-applicants", () => {
    const matches = matchOpensToBreezyPosts({
      opens: opensWithApplicants(
        parseOpensSheet([
          {
            City: "Oak Grove",
            "State/Province": "KY",
            "Applicant (Yes/No)": "Yes",
            "How many if yes": 3,
            "Project Name": "Trends",
          },
        ]),
      ),
      breezyPosts: parseBreezyPostsSheet([
        {
          State: "Active",
          Name: "Retail Merchandiser – Oak Grove, KY",
          Location: "Oak Grove, KY",
          Candidates: 3,
        },
      ]),
    });
    matches[0]!.positionId = "pos-oak";
    matches[0]!.positionName = "Retail Merchandiser – Oak Grove, KY";

    const cycle = {
      dryRun: true,
      candidates: [
        {
          candidateId: "c-advance",
          redactedCandidateId: "adv",
          name: "Alex Advance",
          email: "alex@example.com",
          positionId: "pos-oak",
          appliedAt: null,
          outcome: "auto_advance" as const,
          p204Recommendation: "advance_paperwork_needed",
          confidence: 0.9,
          paperworkTasksPlanned: 1,
          paperworkExecuted: false,
          breezyStageUpdatePlanned: true,
          breezyStageUpdated: false,
          skipReason: null,
          error: null,
          ceoTraceId: "t1",
          forcedAutoAdvance: false,
        },
        {
          candidateId: "c-review",
          redactedCandidateId: "rev",
          name: "Riley Review",
          email: "riley@example.com",
          positionId: "pos-oak",
          appliedAt: null,
          outcome: "human_review" as const,
          p204Recommendation: "needs_human_review",
          confidence: 0.4,
          paperworkTasksPlanned: 0,
          paperworkExecuted: false,
          breezyStageUpdatePlanned: false,
          breezyStageUpdated: false,
          skipReason: null,
          error: null,
          ceoTraceId: "t1",
          forcedAutoAdvance: false,
        },
        {
          candidateId: "c-sent",
          redactedCandidateId: "snt",
          name: "Sam Sent",
          email: null,
          positionId: "pos-oak",
          appliedAt: null,
          outcome: "auto_advance" as const,
          p204Recommendation: "advance_paperwork_needed",
          confidence: 0.95,
          paperworkTasksPlanned: 1,
          paperworkExecuted: true,
          breezyStageUpdatePlanned: true,
          breezyStageUpdated: true,
          skipReason: null,
          error: null,
          ceoTraceId: "t1",
          forcedAutoAdvance: false,
        },
      ],
    };

    const applicants = buildApplicantTrackingList({
      matches,
      cycle: cycle as never,
      emailByCandidateId: new Map([["c-sent", "sam@example.com"]]),
    });
    const tally = tallyApplicantTracking(applicants);
    assert.equal(tally.planned, 1);
    assert.equal(tally.sent, 1);
    assert.equal(tally.skipped, 1);
    assert.equal(applicants.find((a) => a.candidateId === "c-sent")!.email, "sam@example.com");
    assert.equal(applicants.find((a) => a.candidateId === "c-review")!.skipReason, "human_review:needs_human_review");
    assert.equal(applicants.find((a) => a.candidateId === "c-advance")!.storeLabel, "Oak Grove, KY");

    const report = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      xlsxPath: "/tmp/x.xlsx",
      mode: "dry_run",
      dryRun: true,
      confirmLive: false,
      canaryLimit: 5,
      forceFreshReset: false,
      forceAutoAdvance: false,
      forcedAutoAdvanceCount: 0,
      opensWithApplicants: 1,
      totalSheetApplicants: 3,
      totalQualifiedApplicants: 1,
      estimatedPaperworkSends: 1,
      topStoresByApplicants: [],
      matchedOpens: 1,
      unmatchedOpens: 0,
      ambiguousOpens: 0,
      uniquePositionIds: 1,
      positionIds: ["pos-oak"],
      applicantsPerStore: [],
      applicants,
      applicantTally: tally,
      totalPaperworkPlanned: 1,
      totalPaperworkSent: 1,
      totalFailures: 0,
      failures: [],
      cycle: null,
      notes: [],
      warnings: [],
    } satisfies OpenStoresPaperworkSendReport;

    const hidden = formatOpenStoresPaperworkStdout(report);
    assert.doesNotMatch(hidden, /Applicants Processed/);
    assert.match(hidden, /--show-applicants/);

    const shown = formatOpenStoresPaperworkStdout(report, { showApplicants: true });
    assert.match(shown, /Applicants Processed/);
    assert.match(shown, /\[PLANNED\] Alex Advance/);
    assert.match(shown, /\[SENT\] Sam Sent/);
    assert.match(shown, /\[SKIPPED\] Riley Review/);
    assert.match(shown, /skip: human_review:needs_human_review/);
  });

  it("rejects force-auto-advance without live+confirmLive", () => {
    assert.throws(
      () =>
        assertForceAutoAdvanceAllowed({
          forceAutoAdvance: true,
          dryRun: true,
          confirmLive: false,
        }),
      /requires --live --confirm-live/,
    );
    assert.throws(
      () =>
        assertForceAutoAdvanceAllowed({
          forceAutoAdvance: true,
          dryRun: false,
          confirmLive: false,
        }),
      /requires --live --confirm-live/,
    );
    assert.doesNotThrow(() =>
      assertForceAutoAdvanceAllowed({
        forceAutoAdvance: true,
        dryRun: false,
        confirmLive: true,
      }),
    );
    assert.doesNotThrow(() =>
      assertForceAutoAdvanceAllowed({
        forceAutoAdvance: false,
        dryRun: true,
        confirmLive: false,
      }),
    );
  });

  it("auto-injects P122 confirmation phrase for live+confirmLive", async () => {
    const { resolveOpenStoresConfirmationPhrase, assertLivePilotEnvForExecute } = await import(
      "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env"
    );
    const { P122_CONFIRMATION_PHRASE } = await import(
      "@/lib/p122-controlled-live-paperwork-pilot/types"
    );

    const auto = resolveOpenStoresConfirmationPhrase({
      live: true,
      confirmLive: true,
      confirmFlag: null,
    });
    assert.equal(auto.autoInjected, true);
    assert.equal(auto.phrase, P122_CONFIRMATION_PHRASE);

    const explicit = resolveOpenStoresConfirmationPhrase({
      live: true,
      confirmLive: true,
      confirmFlag: P122_CONFIRMATION_PHRASE,
    });
    assert.equal(explicit.autoInjected, false);
    assert.equal(explicit.phrase, P122_CONFIRMATION_PHRASE);

    const dry = resolveOpenStoresConfirmationPhrase({
      live: false,
      confirmLive: false,
      confirmFlag: null,
    });
    assert.equal(dry.phrase, undefined);

    const prev = {
      a: process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED,
      b: process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE,
      c: process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO,
    };
    delete process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED;
    delete process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE;
    delete process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO;
    assert.throws(() => assertLivePilotEnvForExecute(), /missing pilot env/);
    process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED = "true";
    process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE = "true";
    process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO = "true";
    assert.doesNotThrow(() => assertLivePilotEnvForExecute());
    if (prev.a === undefined) delete process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED;
    else process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED = prev.a;
    if (prev.b === undefined) delete process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE;
    else process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE = prev.b;
    if (prev.c === undefined) delete process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO;
    else process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO = prev.c;
  });

  it("maps forced auto-advance applicants and surfaces override warning", () => {
    const forced = mapOutcomeToStatus({
      candidateId: "c1",
      redactedCandidateId: "c1",
      name: "Forced Fran",
      email: "fran@example.com",
      positionId: "pos-1",
      appliedAt: null,
      outcome: "auto_advance",
      p204Recommendation: "needs_recruiter_review",
      confidence: 40,
      paperworkTasksPlanned: 1,
      paperworkExecuted: false,
      breezyStageUpdatePlanned: true,
      breezyStageUpdated: false,
      skipReason: "forced_auto_advance",
      error: null,
      ceoTraceId: "t",
      forcedAutoAdvance: true,
    });
    assert.equal(forced.status, "planned");
    assert.equal(forced.forcedAutoAdvance, true);
    assert.equal(forced.skipReason, "forced_auto_advance");

    const report = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      xlsxPath: "/tmp/x.xlsx",
      mode: "canary_live",
      dryRun: false,
      confirmLive: true,
      canaryLimit: 5,
      forceFreshReset: false,
      forceAutoAdvance: true,
      forcedAutoAdvanceCount: 1,
      opensWithApplicants: 1,
      totalSheetApplicants: 1,
      totalQualifiedApplicants: 1,
      estimatedPaperworkSends: 1,
      topStoresByApplicants: [],
      matchedOpens: 1,
      unmatchedOpens: 0,
      ambiguousOpens: 0,
      uniquePositionIds: 1,
      positionIds: ["pos-1"],
      applicantsPerStore: [],
      applicants: [
        {
          candidateId: "c1",
          redactedCandidateId: "c1",
          name: "Forced Fran",
          email: "fran@example.com",
          positionId: "pos-1",
          positionName: "Retail Merchandiser",
          storeCity: "Oak Grove",
          storeState: "KY",
          storeLabel: "Oak Grove, KY",
          breezyPostName: "Retail Merchandiser – Oak Grove, KY",
          paperworkType: "onboarding_packet",
          status: "planned" as const,
          skipReason: "forced_auto_advance",
          p204Outcome: "auto_advance",
          p204Recommendation: "needs_recruiter_review",
          confidence: 40,
          paperworkTasksPlanned: 1,
          qualifiedAdvanced: true,
          forcedAutoAdvance: true,
          appliedAt: null,
        },
      ],
      applicantTally: {
        planned: 1,
        sent: 0,
        skipped: 0,
        qualifiedAdvanced: 1,
        forcedAutoAdvance: 1,
      },
      totalPaperworkPlanned: 1,
      totalPaperworkSent: 0,
      totalFailures: 0,
      failures: [],
      cycle: null,
      notes: [FORCE_AUTO_ADVANCE_WARNING],
      warnings: [FORCE_AUTO_ADVANCE_WARNING],
    } satisfies OpenStoresPaperworkSendReport;

    const out = formatOpenStoresPaperworkStdout(report, { showApplicants: true });
    assert.match(out, new RegExp(FORCE_AUTO_ADVANCE_WARNING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(out, /forced_auto_advance/);
    assert.match(out, /Forced Fran/);
  });
});
