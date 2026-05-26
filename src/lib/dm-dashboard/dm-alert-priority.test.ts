import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { DmAttentionItem } from "@/lib/dm-dashboard/dm-needs-attention";
import {
  buildPrioritizedTerritoryAlerts,
  filterPrioritizedAlerts,
  mergeTerritoryAlertSources,
  sortPrioritizedAlerts,
} from "@/lib/dm-dashboard/dm-alert-priority";

const referenceIso = "2026-05-26T12:00:00.000Z";

function job(overrides: Partial<BreezyJob> = {}): BreezyJob {
  return {
    jobId: "job-1",
    name: "Merchandiser",
    city: "Dallas",
    state: "TX",
    createdDate: "2026-04-01T00:00:00.000Z",
    updatedDate: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c-1",
    positionId: "job-1",
    positionName: "Merchandiser",
    firstName: "A",
    lastName: "B",
    email: "a@example.com",
    stage: "applied",
    source: "Indeed",
    appliedDate: "2026-05-01T00:00:00.000Z",
    city: "Dallas",
    state: "TX",
    ...overrides,
  };
}

describe("dm alert priority", () => {
  it("marks 14+ day applicant drought as critical", () => {
    const items: DmAttentionItem[] = [
      {
        id: "no-apps-job-1",
        severity: "critical",
        category: "no-applicants-7d",
        title: "No applicants in 7+ days",
        detail: "Job dry",
        jobId: "job-1",
      },
    ];
    const { alerts } = buildPrioritizedTerritoryAlerts(items, [job()], [], referenceIso);
    assert.equal(alerts[0]?.priority, "critical");
    assert.equal(alerts[0]?.recommendedAction, "Increase pay range");
  });

  it("marks 30+ day aging as high with escalate action", () => {
    const items: DmAttentionItem[] = [
      {
        id: "aging-30-job-1",
        severity: "critical",
        category: "job-aging-30",
        title: "Job aging 35d",
        detail: "Old job",
        jobId: "job-1",
      },
    ];
    const staleJob = job({ createdDate: "2026-03-15T00:00:00.000Z" });
    const { alerts } = buildPrioritizedTerritoryAlerts(items, [staleJob], [], referenceIso);
    assert.equal(alerts[0]?.priority, "high");
    assert.match(alerts[0]?.recommendedAction ?? "", /Escalate/i);
  });

  it("marks single-applicant flow as medium", () => {
    const items: DmAttentionItem[] = [
      {
        id: "low-flow-job-1",
        severity: "warning",
        category: "low-applicant-flow",
        title: "Low applicant flow",
        detail: "Only one",
        jobId: "job-1",
      },
    ];
    const { alerts } = buildPrioritizedTerritoryAlerts(
      items,
      [job()],
      [candidate()],
      referenceIso,
    );
    assert.equal(alerts[0]?.priority, "medium");
    assert.equal(alerts[0]?.recommendedAction, "Expand city radius");
  });

  it("sorts highest risk before oldest", () => {
    const items: DmAttentionItem[] = [
      {
        id: "low",
        severity: "warning",
        category: "low-interview-conversion",
        title: "Low conversion",
        detail: "x",
        jobId: "job-1",
      },
      {
        id: "crit",
        severity: "critical",
        category: "no-applicants-7d",
        title: "No apps",
        detail: "x",
        jobId: "job-1",
      },
    ];
    const { alerts } = buildPrioritizedTerritoryAlerts(items, [job()], [], referenceIso);
    const byRisk = sortPrioritizedAlerts(alerts, "highest-risk");
    assert.equal(byRisk[0]?.priority, "critical");
    const byOldest = sortPrioritizedAlerts(alerts, "oldest");
    assert.ok((byOldest[0]?.ageDays ?? 0) >= (byOldest[1]?.ageDays ?? 0));
  });

  it("filters by priority and dedupes merged sources", () => {
    const merged = mergeTerritoryAlertSources(
      [
        {
          id: "dup",
          severity: "critical",
          category: "no-applicants-7d",
          title: "A",
          detail: "a",
          jobId: "job-1",
        },
      ],
      [
        {
          id: "dup",
          severity: "warning",
          category: "no-applicants-7d",
          title: "B",
          detail: "b",
          jobId: "job-1",
        },
      ],
    );
    assert.equal(merged.length, 1);
    const { alerts, summary } = buildPrioritizedTerritoryAlerts(merged, [job()], [], referenceIso);
    assert.ok(summary.criticalCount >= 1);
    const onlyCritical = filterPrioritizedAlerts(alerts, { priority: "critical" });
    assert.ok(onlyCritical.every((row) => row.priority === "critical"));
  });
});
