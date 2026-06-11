import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { AuthSession } from "@/lib/auth/types";
import {
  AUTOMATION_RULES,
  buildGeneratedNotifications,
  buildNotificationCenterSnapshot,
  buildNotificationMetrics,
  buildNotificationSourceKey,
  filterNotificationsForSession,
} from "@/lib/notification-engine";

function recruiterSession(): AuthSession {
  return {
    userId: "u1",
    name: "Recruiter",
    email: "r@test.com",
    role: "recruiter",
    territoryStates: ["TX"],
  };
}

function executiveSession(): AuthSession {
  return {
    userId: "u2",
    name: "Exec",
    email: "e@test.com",
    role: "executive",
    territoryStates: [],
  };
}

describe("notification-engine", () => {
  it("builds stable notification source keys", () => {
    const key = buildNotificationSourceKey("recruiter-follow-up-due", ["Amy", "c1"]);
    assert.equal(key, "recruiter-follow-up-due:amy:c1");
  });

  it("defines automation rules for recruiter, DM, and executive audiences", () => {
    assert.ok(AUTOMATION_RULES.length >= 14);
    assert.ok(AUTOMATION_RULES.some((rule) => rule.recipient === "recruiter"));
    assert.ok(AUTOMATION_RULES.some((rule) => rule.recipient === "dm"));
    assert.ok(AUTOMATION_RULES.some((rule) => rule.recipient === "executive"));
    assert.ok(AUTOMATION_RULES.every((rule) => rule.channels.includes("in-app")));
  });

  it("generates recruiter follow-up notification from workflow data", () => {
    const job: BreezyJob = {
      jobId: "j1",
      name: "Role",
      city: "Dallas",
      state: "TX",
      zip: "",
      displayLocation: "",
      locationSource: "raw",
      status: "published",
      createdDate: "2026-05-01",
      updatedDate: "2026-05-01",
    };
    const candidate: BreezyCandidate = {
      candidateId: "c1",
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
      phone: "",
      source: "",
      stage: "Applied",
      appliedDate: "2026-05-01",
      createdDate: "",
      addedDate: "",
      updatedDate: "",
      addedDateSource: "",
      positionId: "j1",
      positionName: "Role",
      city: "Dallas",
      state: "TX",
      zipCode: "",
      resumeText: "",
      hasResume: false,
    };
    const workflows = {
      c1: {
        candidateId: "c1",
        workflowStatus: "Applied" as const,
        notes: [],
        assignedRecruiter: "Taylor",
        assignedDM: "Amy Harp",
        lastActionAt: "2026-05-01T12:00:00.000Z",
        nextActionNeeded: "Follow up",
        history: [],
        recruitingActions: {
          needsFollowUp: true,
          updatedAt: "2026-05-01T12:00:00.000Z",
          contacted: false,
          paperworkSent: false,
          readyForMel: false,
        },
        followUpDueAt: "2026-05-01T12:00:00.000Z",
        snoozedUntil: null,
        signatureRequestId: null,
        paperworkTemplateKey: null,
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkViewCount: 0,
        paperworkSignedAt: null,
        paperworkStatus: "not_sent" as const,
        paperworkError: null,
        onboardingContactEmail: null,
        directDepositStatus: "not_requested" as const,
        directDepositRequestedAt: null,
        directDepositLastReminderAt: null,
        directDepositNotes: null,
        directDepositTriggeredByUserId: null,
      },
    };

    const generated = buildGeneratedNotifications({
      jobs: [job],
      candidates: [candidate],
      fetchedAt: "2026-05-28T12:00:00.000Z",
      workflows,
      coverage: null,
    });

    assert.ok(
      generated.some(
        (row) =>
          row.ruleId === "recruiter-follow-up-due" || row.ruleId === "recruiter-candidate-aging",
      ),
    );
  });

  it("filters notifications by session role", () => {
    const notifications = [
      {
        id: "1",
        sourceKey: "1",
        ruleId: "recruiter-follow-up-due" as const,
        title: "A",
        message: "A",
        severity: "warning" as const,
        audience: "recruiter" as const,
        recruiterName: "Taylor",
        dmName: null,
        territoryStates: ["TX"],
        state: "TX",
        city: null,
        candidateId: null,
        jobId: null,
        channels: ["in-app" as const],
        status: "active" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        readAt: null,
        dismissedAt: null,
        resolvedAt: null,
        auditHistory: [],
      },
      {
        id: "2",
        sourceKey: "2",
        ruleId: "executive-critical-territory" as const,
        title: "B",
        message: "B",
        severity: "critical" as const,
        audience: "executive" as const,
        recruiterName: null,
        dmName: "Amy Harp",
        territoryStates: ["TX"],
        state: null,
        city: null,
        candidateId: null,
        jobId: null,
        channels: ["in-app" as const],
        status: "active" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        readAt: null,
        dismissedAt: null,
        resolvedAt: null,
        auditHistory: [],
      },
    ];

    const recruiterScoped = filterNotificationsForSession(notifications, recruiterSession());
    assert.equal(recruiterScoped.length, 1);
    assert.equal(recruiterScoped[0]?.audience, "recruiter");

    const executiveScoped = filterNotificationsForSession(notifications, executiveSession());
    assert.equal(executiveScoped.length, 1);
    assert.equal(executiveScoped[0]?.audience, "executive");
  });

  it("builds notification center snapshot with metrics", () => {
    const center = buildNotificationCenterSnapshot(
      {
        jobs: [],
        candidates: [],
        fetchedAt: new Date().toISOString(),
        workflows: null,
        coverage: null,
      },
      executiveSession(),
      [],
    );
    assert.ok(center.metrics);
    assert.equal(typeof center.metrics.alertsGenerated, "number");
    assert.ok(center.rules.length > 0);
  });

  it("computes notification metrics including unread and critical counts", () => {
    const metrics = buildNotificationMetrics(
      [
        {
          id: "1",
          sourceKey: "1",
          ruleId: "executive-open-calls-at-risk",
          title: "Risk",
          message: "Risk",
          severity: "critical",
          audience: "executive",
          recruiterName: null,
          dmName: null,
          territoryStates: [],
          state: null,
          city: null,
          candidateId: null,
          jobId: null,
          channels: ["in-app"],
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          readAt: null,
          dismissedAt: null,
          resolvedAt: null,
          auditHistory: [],
        },
      ],
      [],
    );
    assert.equal(metrics.alertsGenerated, 1);
    assert.equal(metrics.activeCriticalAlerts, 1);
    assert.equal(metrics.unreadCount, 1);
  });
});
