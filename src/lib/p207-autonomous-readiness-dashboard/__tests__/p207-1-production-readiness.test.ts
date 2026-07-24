import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildP207ReadinessSnapshot,
  classifyP207Freshness,
  deriveP207DropboxRecoveryState,
  evaluateP207AlertConditions,
  mergeP207Alerts,
  stubVendorBlockedDropbox,
  withDropboxRecovery,
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
    workflowStatus: "Paperwork Needed",
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

describe("P207.1 production readiness hardening", () => {
  it("classifies data freshness Live / Delayed / Stale", () => {
    const generatedAt = "2026-07-16T12:00:00.000Z";
    assert.equal(
      classifyP207Freshness(generatedAt, "2026-07-16T12:02:00.000Z").state,
      "Live",
    );
    assert.equal(
      classifyP207Freshness(generatedAt, "2026-07-16T12:10:00.000Z").state,
      "Delayed",
    );
    assert.equal(
      classifyP207Freshness(generatedAt, "2026-07-16T12:20:00.000Z").state,
      "Stale",
    );
  });

  it("generates critical Dropbox quota alert and deduplicates on refresh", () => {
    const dropbox = stubVendorBlockedDropbox();
    const snap1 = buildP207ReadinessSnapshot({
      candidates: [candidate({ candidateId: "p1" })],
      workflows: { p1: workflow({ candidateId: "p1" }) },
      dropbox,
      now: new Date("2026-07-16T12:00:00.000Z"),
    });
    const critical = snap1.alerts.filter((a) => !a.resolved && a.severity === "critical");
    assert.ok(critical.some((a) => a.title.includes("Dropbox quota")));
    const fp = critical.find((a) => a.title.includes("Dropbox quota"))!.fingerprint;

    const snap2 = buildP207ReadinessSnapshot({
      candidates: [candidate({ candidateId: "p1" })],
      workflows: { p1: workflow({ candidateId: "p1" }) },
      dropbox,
      priorAlerts: snap1.alerts,
      now: new Date("2026-07-16T12:05:00.000Z"),
    });
    const same = snap2.alerts.filter((a) => a.fingerprint === fp && !a.resolved);
    assert.equal(same.length, 1);
    assert.equal(same[0]!.id, snap1.alerts.find((a) => a.fingerprint === fp)!.id);
    assert.equal(same[0]!.firstObservedAt, "2026-07-16T12:00:00.000Z");
    assert.equal(same[0]!.lastObservedAt, "2026-07-16T12:05:00.000Z");
  });

  it("resolves alerts when condition clears", () => {
    const drafts = evaluateP207AlertConditions({
      nowIso: "2026-07-16T12:00:00.000Z",
      stages: [
        {
          stage: "Paperwork Needed",
          count: 1,
          trend: 0,
          lastUpdate: null,
          changeToday: 0,
          largestBlocker: null,
          secondBlocker: null,
          estimatedHoursToClear: null,
          blockers: [],
        },
      ],
      dropbox: stubVendorBlockedDropbox(),
      immediateSendReady: 1,
      validation: {
        authoritativeTotal: 1,
        dashboardTotal: 1,
        countMismatches: [],
        refreshLatencyMs: 1,
        missingData: [],
        matched: true,
      },
      questionnaireCoveragePct: 80,
      signedToday: 0,
      readyForMel: 0,
      paperworkSentAgingCount: 0,
      unresolvedSendOps: 0,
      duplicateEnvelopeRisk: 0,
      storeAvailable: true,
      statusSyncOk: true,
      callbackHealthDegraded: false,
      previousQuota: 0,
      firstSuccessfulSendToday: false,
    });
    const prior = mergeP207Alerts({
      drafts,
      prior: [],
      nowIso: "2026-07-16T12:00:00.000Z",
    });
    const cleared = mergeP207Alerts({
      drafts: [],
      prior,
      nowIso: "2026-07-16T12:10:00.000Z",
    });
    assert.ok(cleared.every((a) => a.resolved));
    assert.ok(cleared[0]!.resolvedAt);
  });

  it("transitions Dropbox recovery to Quota Restored — Pilot Required", () => {
    const restored = withDropboxRecovery(
      {
        productionQuota: 25,
        testMode: false,
        apiStatus: "ok",
        lastSuccessfulSendAt: null,
        lastFailedSendAt: null,
        templatesAvailable: 5,
        accountEmail: "humanresource@srsmerchandising.com",
        accountIdHash: "x",
        configurationStatus: "software_ready",
        softwareReady: true,
        vendorBlocked: false,
        detail: "quota restored",
      },
      {
        previousQuota: 0,
        lastObservedQuota: 0,
        pilotInProgress: false,
        productionSendHealthy: false,
      },
    );
    assert.equal(restored.recoveryState, "Quota Restored — Pilot Required");
    assert.equal(restored.quotaRestoredRecommendP206, true);

    const blocked = deriveP207DropboxRecoveryState({
      dropbox: {
        productionQuota: 0,
        testMode: false,
        apiStatus: "ok",
        lastSuccessfulSendAt: null,
        lastFailedSendAt: null,
        templatesAvailable: 5,
        accountEmail: null,
        accountIdHash: null,
        configurationStatus: "vendor_blocked",
        softwareReady: true,
        vendorBlocked: true,
        detail: "blocked",
      },
      history: { previousQuota: 0, lastObservedQuota: 0, pilotInProgress: false, productionSendHealthy: false },
    });
    assert.equal(blocked.recoveryState, "Vendor Blocked");
  });

  it("never auto-executes P206/P192 and keeps write safety false", () => {
    const snap = buildP207ReadinessSnapshot({
      candidates: [candidate({ candidateId: "x1" })],
      workflows: { x1: workflow({ candidateId: "x1" }) },
      dropbox: withDropboxRecovery(
        {
          productionQuota: 10,
          testMode: false,
          apiStatus: "ok",
          lastSuccessfulSendAt: null,
          lastFailedSendAt: null,
          templatesAvailable: 5,
          accountEmail: null,
          accountIdHash: null,
          configurationStatus: "software_ready",
          softwareReady: true,
          vendorBlocked: false,
          detail: "restored",
        },
        {
          previousQuota: 0,
          lastObservedQuota: 0,
          pilotInProgress: false,
          productionSendHealthy: false,
        },
      ),
    });
    assert.equal(snap.safety.p206AutoRerun, false);
    assert.equal(snap.safety.p192Starts, false);
    assert.equal(snap.safety.dropboxSends, false);
    assert.equal(snap.safety.lifecycleWrites, false);
    assert.equal(snap.safety.melWrites, false);
    assert.ok(
      snap.alerts.some(
        (a) =>
          !a.resolved &&
          a.title.includes("quota restored") &&
          a.recommendedAction.toLowerCase().includes("p206"),
      ),
    );
  });

  it("keeps API/UI generatedAt parity fields on snapshot", () => {
    const now = new Date("2026-07-16T13:00:00.000Z");
    const snap = buildP207ReadinessSnapshot({
      candidates: [],
      workflows: {},
      dropbox: stubVendorBlockedDropbox(),
      now,
    });
    assert.equal(snap.generatedAt, now.toISOString());
    assert.equal(snap.freshness.generatedAt, snap.generatedAt);
  });

  it("reconciles authoritative stage totals without double counting", () => {
    const candidates = [
      candidate({ candidateId: "a" }),
      candidate({ candidateId: "b" }),
      candidate({ candidateId: "c" }),
    ];
    const workflows = {
      a: workflow({ candidateId: "a", workflowStatus: "Applied" }),
      b: workflow({ candidateId: "b", workflowStatus: "Needs Review" }),
      c: workflow({ candidateId: "c", workflowStatus: "Paperwork Needed" }),
    };
    const snap = buildP207ReadinessSnapshot({
      candidates,
      workflows,
      dropbox: stubVendorBlockedDropbox(),
    });
    assert.equal(snap.validation.matched, true);
    const sum = snap.stages.reduce((n, s) => n + s.count, 0);
    assert.equal(sum, snap.validation.dashboardTotal);
    assert.equal(snap.immediateSendReady, 1);
  });
});
