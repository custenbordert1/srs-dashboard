import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { evaluateP184Eligibility } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import { DEFAULT_P184_CONFIG } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import {
  classifyP1851PaperworkNeed,
  collectP1851HiringEvidence,
  mapDropboxSummaryToP1851Lifecycle,
  normalizeP1851Stage,
  resetP1851StateMemoryForTests,
  resolveP1851JobMapping,
  upsertP1851MappingAliases,
  loadP1851RecoveryState,
} from "@/lib/p185-1-paperwork-eligibility-recovery";
import { installIsolatedRecruitingDataDir } from "@/lib/test/recruiting-test-isolation";

function job(overrides: Partial<BreezyJob> & { jobId: string; name: string }): BreezyJob {
  return {
    city: "Austin",
    state: "TX",
    zip: "78701",
    displayLocation: "Austin, TX",
    locationSource: "missing",
    status: "published",
    createdDate: "2026-01-01T00:00:00.000Z",
    updatedDate: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function row(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  return {
    candidateId: "cand-1",
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    stage: "Applied",
    workflowStatus: "Applied",
    positionId: "closed-pos-1",
    positionName: "Merchandiser",
    city: "Austin",
    state: "TX",
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    signatureRequestId: null,
    notes: [],
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

describe("P185.1 paperwork eligibility recovery", () => {
  let isolation: Awaited<ReturnType<typeof installIsolatedRecruitingDataDir>>;

  beforeEach(async () => {
    isolation = await installIsolatedRecruitingDataDir("p185-1-");
    resetP1851StateMemoryForTests();
  });

  afterEach(async () => {
    await isolation.restore();
    resetP1851StateMemoryForTests();
  });

  it("maps exact position ID including friendlyId alias", () => {
    const published = [
      job({
        jobId: "abc123",
        friendlyId: "abc123-merchandiser-austin-tx",
        name: "Merchandiser",
      }),
    ];
    const byId = resolveP1851JobMapping({
      row: row({ positionId: "abc123", workflowStatus: "Applied" }),
      publishedJobs: published,
    });
    assert.equal(byId.mappingMethod, "exact_breezy_position_id");
    assert.equal(byId.resolvedPositionId, "abc123");

    const byFriendly = resolveP1851JobMapping({
      row: row({ positionId: "abc123-merchandiser-austin-tx" }),
      publishedJobs: published,
    });
    assert.equal(byFriendly.mappingMethod, "exact_breezy_position_id");
    assert.equal(byFriendly.resolvedPositionId, "abc123");
  });

  it("maps via verified legacy / P109 approved mapping", () => {
    const published = [job({ jobId: "pub-1", name: "Merchandiser" })];
    const result = resolveP1851JobMapping({
      row: row({ positionId: "legacy-closed-only" }),
      publishedJobs: published,
      closedJobs: [],
      approvedMappings: [
        {
          candidateId: "cand-1",
          closedPositionId: "legacy-closed-only",
          recommendedPositionId: "pub-1",
        },
      ],
    });
    assert.equal(result.mappingMethod, "p109_approved_mapping");
    assert.equal(result.resolvedPositionId, "pub-1");
  });

  it("maps unique title+city+state and rejects ambiguous matches", () => {
    const unique = resolveP1851JobMapping({
      row: row({ positionId: "unknown", positionName: "Merchandiser", city: "Austin", state: "TX" }),
      publishedJobs: [job({ jobId: "only", name: "Merchandiser", city: "Austin", state: "TX" })],
    });
    assert.equal(unique.mappingMethod, "unique_title_city_state");

    const ambiguous = resolveP1851JobMapping({
      row: row({ positionId: "unknown", positionName: "Merchandiser", city: "Austin", state: "TX" }),
      publishedJobs: [
        job({ jobId: "a", name: "Merchandiser", city: "Austin", state: "TX" }),
        job({ jobId: "b", name: "Merchandiser", city: "Austin", state: "TX" }),
      ],
    });
    assert.equal(ambiguous.mappingMethod, "unresolved");
    assert.equal(ambiguous.ambiguity, true);
  });

  it("allows closed ad for onboarding only when selected", () => {
    const closed = [job({ jobId: "closed-pos-1", name: "Merchandiser", status: "closed" })];
    const without = resolveP1851JobMapping({
      row: row(),
      publishedJobs: [],
      closedJobs: closed,
      selectedForHiring: false,
    });
    assert.equal(without.acceptingForOnboarding, false);

    const withSel = resolveP1851JobMapping({
      row: row(),
      publishedJobs: [],
      closedJobs: closed,
      selectedForHiring: true,
    });
    assert.equal(withSel.acceptingForOnboarding, true);
    assert.equal(withSel.onboardingJobClassification, "historical_valid_for_onboarding");
  });

  it("does not advance Applied without hiring evidence", () => {
    const evidence = collectP1851HiringEvidence({ row: row({ workflowStatus: "Applied" }) });
    assert.equal(evidence.present, false);

    const mapping = resolveP1851JobMapping({
      row: row(),
      publishedJobs: [job({ jobId: "closed-pos-1", name: "Merchandiser" })],
    });
    const classified = classifyP1851PaperworkNeed({
      row: row({ workflowStatus: "Applied" }),
      mapping,
      hiringEvidence: evidence,
      envelopeLifecycle: null,
    });
    assert.equal(classified.classification, "applied_not_selected");
    assert.equal(classified.reviewBucket, "F");
  });

  it("normalizes selected candidate evidence toward paperwork eligibility class", () => {
    const selected = row({ workflowStatus: "Selected", positionId: "pub-1" });
    const evidence = collectP1851HiringEvidence({ row: selected });
    assert.equal(evidence.present, true);
    const mapping = resolveP1851JobMapping({
      row: selected,
      publishedJobs: [job({ jobId: "pub-1", name: "Merchandiser" })],
      selectedForHiring: true,
    });
    const classified = classifyP1851PaperworkNeed({
      row: selected,
      mapping,
      hiringEvidence: evidence,
      envelopeLifecycle: null,
    });
    assert.equal(classified.classification, "eligible_new_packet");
    assert.equal(normalizeP1851Stage("Paperwork Needed"), "paperwork_needed");
  });

  it("treats P181 operator queue as hiring evidence", () => {
    const evidence = collectP1851HiringEvidence({
      row: row({ workflowStatus: "Applied" }),
      operatorQueueIds: new Set(["cand-1"]),
    });
    assert.ok(evidence.sources.some((s) => s.includes("operator_queue")));
  });

  it("blocks duplicate when active envelope present", () => {
    const mapping = resolveP1851JobMapping({
      row: row({ positionId: "pub-1" }),
      publishedJobs: [job({ jobId: "pub-1", name: "Merchandiser" })],
    });
    const classified = classifyP1851PaperworkNeed({
      row: row({ signatureRequestId: "env-1", paperworkStatus: "sent" }),
      mapping,
      hiringEvidence: { present: true, sources: ["workflow_status:Selected"], detail: "x" },
      envelopeLifecycle: "confirmed_sent",
    });
    assert.equal(classified.classification, "already_active_packet");
  });

  it("blocks completed/signed packets", () => {
    const mapping = resolveP1851JobMapping({
      row: row({ positionId: "pub-1" }),
      publishedJobs: [job({ jobId: "pub-1", name: "Merchandiser" })],
    });
    const classified = classifyP1851PaperworkNeed({
      row: row({ workflowStatus: "Signed", paperworkStatus: "signed" }),
      mapping,
      hiringEvidence: { present: false, sources: [], detail: null },
      envelopeLifecycle: "signed",
    });
    assert.equal(classified.classification, "paperwork_completed");
  });

  it("flags failed/expired envelopes for replacement review only", () => {
    const mapping = resolveP1851JobMapping({
      row: row({ positionId: "pub-1" }),
      publishedJobs: [job({ jobId: "pub-1", name: "Merchandiser" })],
    });
    const classified = classifyP1851PaperworkNeed({
      row: row({ signatureRequestId: "env-x" }),
      mapping,
      hiringEvidence: { present: true, sources: ["workflow_status:Selected"], detail: "x" },
      envelopeLifecycle: "expired",
    });
    assert.equal(classified.classification, "eligible_replacement_packet");
    assert.equal(classified.reviewBucket, "B");
  });

  it("classifies missing email and unresolved jobs", () => {
    const mapping = resolveP1851JobMapping({
      row: row({ positionId: "nope", email: "" }),
      publishedJobs: [],
    });
    const noEmail = classifyP1851PaperworkNeed({
      row: row({ email: "" }),
      mapping: { ...mapping, resolvedPositionId: "pub-1", mappingMethod: "exact_breezy_position_id" },
      hiringEvidence: { present: true, sources: ["workflow_status:Selected"], detail: "x" },
      envelopeLifecycle: null,
    });
    assert.equal(noEmail.classification, "invalid_contact");

    const unresolved = classifyP1851PaperworkNeed({
      row: row(),
      mapping,
      hiringEvidence: { present: true, sources: ["workflow_status:Selected"], detail: "x" },
      envelopeLifecycle: null,
    });
    assert.equal(unresolved.classification, "unresolved_job");
  });

  it("persists mapping aliases across loads", async () => {
    await upsertP1851MappingAliases([
      {
        originalPositionId: "closed-1",
        resolvedPositionId: "pub-1",
        mappingMethod: "verified_legacy_id",
        confidence: "high",
        updatedAt: new Date().toISOString(),
      },
    ]);
    resetP1851StateMemoryForTests();
    const state = await loadP1851RecoveryState();
    assert.equal(state.aliases.length, 1);
    assert.equal(state.aliases[0]?.resolvedPositionId, "pub-1");
  });

  it("maps Dropbox summaries to lifecycle states", () => {
    assert.equal(
      mapDropboxSummaryToP1851Lifecycle({
        signatureRequestId: "e1",
        isComplete: true,
        isDeclined: false,
        signatures: [],
        rawStatus: "complete",
      }),
      "signed",
    );
    assert.equal(
      mapDropboxSummaryToP1851Lifecycle({
        signatureRequestId: "e1",
        isComplete: false,
        isDeclined: true,
        signatures: [],
        rawStatus: "declined",
      }),
      "declined",
    );
  });

  it("P184 accepts verified onboarding job without weakening default closed rejection", () => {
    const closedJob = job({ jobId: "closed-1", name: "Merchandiser", status: "closed" });
    const base = evaluateP184Eligibility({
      row: row({
        workflowStatus: "Paperwork Needed",
        positionId: "closed-1",
        paperworkStatus: "not_sent",
      }),
      onboarding: null,
      job: closedJob,
      config: { ...DEFAULT_P184_CONFIG, enabled: false, mode: "dry_run" },
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(base.eligible, false);

    const verified = evaluateP184Eligibility({
      row: row({
        workflowStatus: "Paperwork Needed",
        positionId: "closed-1",
        paperworkStatus: "not_sent",
      }),
      onboarding: null,
      job: closedJob,
      config: { ...DEFAULT_P184_CONFIG, enabled: false, mode: "dry_run" },
      queueItems: [],
      completedIdempotencyKeys: new Set(),
      verifiedOnboardingJob: {
        positionId: "closed-1",
        acceptingForOnboarding: true,
        classification: "historical_valid_for_onboarding",
        detail: "selected on closed ad",
      },
    });
    assert.equal(verified.gates.find((g) => g.id === "job_active")?.passed, true);
    assert.equal(verified.gates.find((g) => g.id === "position_accepting")?.passed, true);
  });

  it("does not enable live sends in this phase (config contract)", () => {
    assert.equal(DEFAULT_P184_CONFIG.enabled, false);
    assert.equal(DEFAULT_P184_CONFIG.mode, "dry_run");
    assert.notEqual(process.env.P185_PRODUCTION_AUTOMATION_ENABLED, "1");
  });
});
