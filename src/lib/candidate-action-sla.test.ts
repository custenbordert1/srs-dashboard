import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCandidateSlaSnapshot,
  calendarDaysSince,
  isFollowUpOverdue,
  isSnoozedUntil,
  SLA_FOLLOW_UP_HOURS,
} from "@/lib/candidate-action-sla";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";

describe("candidate-action-sla", () => {
  it("flags follow-up overdue by followUpDueAt", () => {
    const ref = Date.parse("2026-05-21T12:00:00.000Z");
    const due = "2026-05-20T10:00:00.000Z";
    assert.equal(
      isFollowUpOverdue({
        recruitingActions: emptyRecruitingActions(),
        followUpDueAt: due,
        referenceMs: ref,
      }),
      true,
    );
  });

  it("flags follow-up overdue after 48h on flag alone", () => {
    const ref = Date.parse("2026-05-21T12:00:00.000Z");
    const flagAt = new Date(ref - (SLA_FOLLOW_UP_HOURS + 1) * 60 * 60 * 1000).toISOString();
    const actions = { ...emptyRecruitingActions(), needsFollowUp: true, updatedAt: flagAt };
    assert.equal(isFollowUpOverdue({ recruitingActions: actions, referenceMs: ref }), true);
  });

  it("marks applied aging warn at threshold", () => {
    const ref = Date.parse("2026-05-21T12:00:00.000Z");
    const applied = new Date(ref - 4 * 24 * 60 * 60 * 1000).toISOString();
    const sla = buildCandidateSlaSnapshot({
      appliedDate: applied,
      workflowStatus: "Applied",
      lastActionAt: applied,
      recruitingActions: emptyRecruitingActions(),
      referenceMs: ref,
    });
    assert.equal(sla.appliedAgingSeverity, "warn");
    assert.equal(calendarDaysSince(applied, ref), 4);
  });

  it("detects active snooze window", () => {
    const ref = Date.parse("2026-05-21T12:00:00.000Z");
    const until = new Date(ref + 6 * 60 * 60 * 1000).toISOString();
    assert.equal(isSnoozedUntil(until, ref), true);
    assert.equal(isSnoozedUntil("2026-05-20T00:00:00.000Z", ref), false);
  });
});
