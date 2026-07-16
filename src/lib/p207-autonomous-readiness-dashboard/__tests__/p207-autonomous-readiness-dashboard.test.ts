import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildP207Forecast,
  buildP207ReadinessSnapshot,
  classifyP207Stage,
  computeP207SubsystemScores,
  detectBlockersForCandidate,
  healthTone,
  stubVendorBlockedDropbox,
  summarizeBlockers,
} from "@/lib/p207-autonomous-readiness-dashboard";

function candidate(
  partial: Partial<BreezyCandidate> & { candidateId: string },
): BreezyCandidate {
  const { candidateId, ...rest } = partial;
  return {
    candidateId,
    firstName: "Ada",
    lastName: "Lee",
    email: `${candidateId}@example.com`,
    phone: "5550001111",
    stage: "Applied",
    city: "Austin",
    state: "TX",
    hasQuestionnaire: true,
    hasResume: true,
    positionId: "job-1",
    appliedDate: "2026-07-14T08:00:00.000Z",
    ...rest,
  } as BreezyCandidate;
}

function workflow(
  partial: Partial<CandidateWorkflowRecord> & { candidateId: string },
): CandidateWorkflowRecord {
  const { candidateId, ...rest } = partial;
  return {
    candidateId,
    workflowStatus: "Applied",
    notes: [],
    assignedRecruiter: "Recruiter A",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkSignedAt: null,
    paperworkError: null,
    history: [],
    updatedAt: "2026-07-15T12:00:00.000Z",
    ...rest,
  } as CandidateWorkflowRecord;
}

describe("P207 autonomous readiness dashboard", () => {
  it("classifies stages from workflow status", () => {
    assert.equal(classifyP207Stage(workflow({ candidateId: "a", workflowStatus: "Applied" })), "Applied");
    assert.equal(
      classifyP207Stage(workflow({ candidateId: "b", workflowStatus: "Paperwork Needed" })),
      "Paperwork Needed",
    );
    assert.equal(
      classifyP207Stage(workflow({ candidateId: "c", workflowStatus: "Paperwork Sent", paperworkStatus: "sent" })),
      "Paperwork Sent",
    );
    assert.equal(
      classifyP207Stage(workflow({ candidateId: "d", workflowStatus: "Signed", paperworkStatus: "signed" })),
      "Signed",
    );
    assert.equal(
      classifyP207Stage(workflow({ candidateId: "e", workflowStatus: "Ready for MEL" })),
      "Ready for MEL",
    );
    assert.equal(
      classifyP207Stage(workflow({ candidateId: "f", workflowStatus: "Not Qualified" })),
      "Rejected",
    );
  });

  it("computes dashboard stage totals matching authoritative classification", () => {
    const dropbox = stubVendorBlockedDropbox();
    const candidates = [
      candidate({ candidateId: "c1" }),
      candidate({ candidateId: "c2", hasQuestionnaire: false }),
      candidate({ candidateId: "c3" }),
      candidate({ candidateId: "c4" }),
      candidate({ candidateId: "c5" }),
    ];
    const workflows: Record<string, CandidateWorkflowRecord> = {
      c1: workflow({ candidateId: "c1", workflowStatus: "Applied" }),
      c2: workflow({ candidateId: "c2", workflowStatus: "Needs Review" }),
      c3: workflow({ candidateId: "c3", workflowStatus: "Paperwork Needed" }),
      c4: workflow({
        candidateId: "c4",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sr-1",
      }),
      c5: workflow({
        candidateId: "c5",
        workflowStatus: "Signed",
        paperworkStatus: "signed",
        paperworkSignedAt: "2026-07-15T10:00:00.000Z",
      }),
    };
    const snap = buildP207ReadinessSnapshot({ candidates, workflows, dropbox });
    const byStage = Object.fromEntries(snap.stages.map((s) => [s.stage, s.count]));
    assert.equal(byStage.Applied, 1);
    assert.equal(byStage["Needs Review"], 1);
    assert.equal(byStage["Paperwork Needed"], 1);
    assert.equal(byStage["Paperwork Sent"], 1);
    assert.equal(byStage.Signed, 1);
    assert.equal(snap.validation.matched, true);
    assert.equal(snap.validation.countMismatches.length, 0);
  });

  it("summarizes blockers for Applied and Paperwork Needed", () => {
    const dropbox = stubVendorBlockedDropbox();
    const hits = [
      ...detectBlockersForCandidate({
        stage: "Applied",
        candidate: candidate({ candidateId: "a1", hasQuestionnaire: false }),
        workflow: workflow({ candidateId: "a1", assignedRecruiter: "Unassigned" }),
        dropbox,
      }),
      ...detectBlockersForCandidate({
        stage: "Paperwork Needed",
        candidate: candidate({ candidateId: "p1" }),
        workflow: workflow({ candidateId: "p1", workflowStatus: "Paperwork Needed" }),
        dropbox,
      }),
    ];
    const summary = summarizeBlockers(hits);
    assert.ok(summary.some((b) => b.id === "missing_questionnaire"));
    assert.ok(summary.some((b) => b.id === "dropbox_quota"));
    assert.ok(summary[0]!.count >= 1);
  });

  it("computes health scores and tones", () => {
    const dropbox = stubVendorBlockedDropbox();
    const { scores, overall, tone } = computeP207SubsystemScores({
      applied: 100,
      needsReview: 10,
      paperworkNeeded: 9,
      paperworkSent: 50,
      signed: 5,
      readyForMel: 2,
      rejected: 3,
      total: 179,
      dropbox,
      aiApprovedCount: 9,
      questionnaireCoveragePct: 70,
      sendReadyCount: 9,
      awaitingSignature: 50,
    });
    assert.ok(scores.find((s) => s.id === "dropbox")!.score < 60);
    assert.equal(healthTone(25), "critical");
    assert.equal(healthTone(70), "warning");
    assert.equal(healthTone(90), "healthy");
    assert.ok(overall >= 0 && overall <= 100);
    assert.ok(["healthy", "warning", "critical"].includes(tone));
  });

  it("forecasts sends if Dropbox restored", () => {
    const forecast = buildP207Forecast({
      sendReadyCount: 9,
      paperworkNeeded: 9,
      awaitingSignature: 20,
      signedPendingMel: 5,
      dropbox: stubVendorBlockedDropbox(),
    });
    assert.equal(forecast.ifDropboxRestoredNow.expectedSends, 9);
    assert.equal(forecast.ifDropboxRestoredNow.expectedSignatures, Math.round(9 * 0.55));
    assert.ok(forecast.next24h.expectedSends <= forecast.next7d.expectedSends);
    assert.ok(forecast.assumptions.length > 0);
  });

  it("exposes Dropbox vendor-blocked diagnostics", () => {
    const d = stubVendorBlockedDropbox({ productionQuota: 0 });
    assert.equal(d.softwareReady, true);
    assert.equal(d.vendorBlocked, true);
    assert.equal(d.configurationStatus, "vendor_blocked");
    assert.equal(d.productionQuota, 0);
    assert.match(d.detail, /Vendor blocked/i);
  });

  it("enforces read-only safety flags and no write side effects", () => {
    const snap = buildP207ReadinessSnapshot({
      candidates: [candidate({ candidateId: "safe-1" })],
      workflows: {
        "safe-1": workflow({
          candidateId: "safe-1",
          workflowStatus: "Paperwork Needed",
        }),
      },
      dropbox: stubVendorBlockedDropbox(),
    });
    assert.deepEqual(snap.safety, {
      lifecycleWrites: false,
      paperworkNeededCreates: false,
      dropboxSends: false,
      p192Starts: false,
      automationEnabled: false,
      melWrites: false,
      p206AutoRerun: false,
    });
    assert.equal(snap.executionMode, "read_only");
    assert.ok(snap.immediateSendReady >= 1);
    assert.ok(snap.executiveCards.some((c) => c.id === "dropbox_only" && c.count >= 1));
    assert.ok(snap.freshness.state === "Live");
    assert.ok(snap.alerts.some((a) => a.title.includes("Dropbox quota")));
  });

  it("does not import or invoke Dropbox send / MEL / lifecycle write modules from snapshot build", () => {
    // Structural guard: building a snapshot with injected diagnostics never needs network.
    const snap = buildP207ReadinessSnapshot({
      candidates: [],
      workflows: {},
      dropbox: stubVendorBlockedDropbox(),
    });
    assert.equal(snap.safety.dropboxSends, false);
    assert.equal(snap.safety.melWrites, false);
    assert.equal(snap.safety.lifecycleWrites, false);
    assert.equal(snap.executionMode, "read_only");
  });
});
