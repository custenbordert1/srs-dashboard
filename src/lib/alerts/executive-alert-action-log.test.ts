import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import {
  buildExecutiveAlertFollowUpQueue,
  isFollowUpOverdue,
} from "@/lib/alerts/executive-alert-follow-up-queue";
import {
  listExecutiveAlertActionLogs,
  saveExecutiveAlertNote,
  upsertExecutiveAlertFollowUp,
  upsertExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-store";

function sampleAlert(overrides: Partial<ExecutiveAlert> = {}): ExecutiveAlert {
  return {
    id: "placement:zero-pipeline:opp-1",
    title: "Zero pipeline · Store 101",
    description: "No candidates in pipeline",
    severity: "critical",
    category: "placement",
    impactScore: 88,
    recommendedAction: "placement-review",
    destination: { tabId: "placement-command-center", label: "Placement Command Center" },
    automationKind: "placement-review",
    manualOnly: true,
    createdAt: "2026-05-28T12:00:00.000Z",
    reason: "Open calls with zero pipeline",
    context: {
      opportunityId: "opp-1",
      storeName: "Store 101",
      projectName: "Houston Retail",
      client: "Acme",
      linkedCandidates: [],
      linkedReps: [],
      dataSources: ["Recruiting Intelligence Cache"],
    },
    ...overrides,
  };
}

const session = {
  userId: "exec-1",
  email: "exec@example.com",
  name: "Taylor Executive",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

describe("executive alert action log and follow-up queue", () => {
  it("saves notes and records a note action log entry", async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), "srs-alert-actions-"));
    process.chdir(tempDir);
    try {
      const result = await saveExecutiveAlertNote(
        session,
        "placement:zero-pipeline:opp-1",
        "DM notified · waiting on recruiter assignment",
      );
      assert.equal(result.overlay.note, "DM notified · waiting on recruiter assignment");
      assert.equal(result.logEntry.kind, "note");
      assert.equal(result.logEntry.reviewedBy, "Taylor Executive");

      const logs = await listExecutiveAlertActionLogs("placement:zero-pipeline:opp-1");
      const noteLogs = logs.filter((row) => row.kind === "note");
      assert.equal(noteLogs.length, 1);
      assert.equal(noteLogs[0]?.note, "DM notified · waiting on recruiter assignment");
    } finally {
      process.chdir(previousCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates follow-up assignments with owner, due date, and priority", async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), "srs-alert-followups-"));
    process.chdir(tempDir);
    try {
      const result = await upsertExecutiveAlertFollowUp(session, {
        alertId: "placement:zero-pipeline:opp-1",
        ownerKind: "dm",
        ownerName: "Jordan Miles",
        dueDate: "2026-06-20",
        priority: "critical",
        notes: "Confirm rep coverage plan",
      });

      assert.equal(result.followUp.ownerName, "Jordan Miles");
      assert.equal(result.followUp.priority, "critical");
      assert.equal(result.logEntry.kind, "follow-up-assigned");
      assert.match(result.logEntry.note ?? "", /Jordan Miles/);
    } finally {
      process.chdir(previousCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("records status changes in the action log", async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), "srs-alert-status-log-"));
    process.chdir(tempDir);
    try {
      await upsertExecutiveAlertStatusOverlay(session, "placement:zero-pipeline:opp-1", "new");
      await upsertExecutiveAlertStatusOverlay(session, "placement:zero-pipeline:opp-1", "in-review", {
        previousStatus: "new",
      });

      const logs = await listExecutiveAlertActionLogs("placement:zero-pipeline:opp-1");
      const reviewed = logs.find((row) => row.status === "in-review");
      assert.ok(reviewed);
      assert.equal(reviewed?.previousStatus, "new");
      assert.equal(reviewed?.reviewedByUserId, "exec-1");
    } finally {
      process.chdir(previousCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("flags overdue follow-ups and sorts queue with overdue first", () => {
    const referenceMs = Date.parse("2026-06-15T12:00:00.000Z");
    assert.equal(isFollowUpOverdue("2026-06-10", referenceMs), true);
    assert.equal(isFollowUpOverdue("2026-06-20", referenceMs), false);

    const queue = buildExecutiveAlertFollowUpQueue(
      [sampleAlert()],
      [
        {
          id: "fu-1",
          alertId: "placement:zero-pipeline:opp-1",
          ownerKind: "recruiter",
          ownerName: "Alex Recruiter",
          dueDate: "2026-06-20",
          priority: "medium",
          createdAt: "2026-06-01T00:00:00.000Z",
          createdByUserId: "exec-1",
          createdByName: "Taylor Executive",
        },
        {
          id: "fu-2",
          alertId: "placement:zero-pipeline:opp-1",
          ownerKind: "dm",
          ownerName: "Jordan Miles",
          dueDate: "2026-06-10",
          priority: "low",
          createdAt: "2026-06-01T00:00:00.000Z",
          createdByUserId: "exec-1",
          createdByName: "Taylor Executive",
        },
      ],
      { "placement:zero-pipeline:opp-1": "in-review" },
      referenceMs,
    );

    assert.equal(queue.length, 2);
    assert.equal(queue[0]?.isOverdue, true);
    assert.equal(queue[0]?.followUp.ownerName, "Jordan Miles");
    assert.equal(queue[0]?.storeLabel, "Store 101");
    assert.equal(queue[0]?.status, "in-review");
  });
});
