import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClosedAdMappingBlocker,
  resolveClosedAdProjectMapping,
} from "@/lib/closed-ad-project-mapping/resolve-closed-ad-project-mapping";
import type { BreezyJob } from "@/lib/breezy-api";

function job(partial: Partial<BreezyJob> & { jobId: string; name: string }): BreezyJob {
  return {
    city: "Phoenix",
    state: "AZ",
    status: "published",
    ...partial,
  } as BreezyJob;
}

const row = {
  candidateId: "c1",
  positionId: "closed-pos",
  positionTitle: "Solar Installer",
  city: "Phoenix",
  state: "AZ",
} as never;

describe("closed-ad-project-mapping", () => {
  it("passes published position without remapping", () => {
    const published = job({ jobId: "pub-1", name: "Solar Installer" });
    const result = resolveClosedAdProjectMapping({
      row: { ...row, positionId: "pub-1" },
      jobsByPositionId: new Map([["pub-1", published]]),
      publishedJobs: [published],
    });
    assert.equal(result.status, "published");
    assert.equal(result.passesPublishedJobGate, true);
    assert.equal(isClosedAdMappingBlocker(result.status), false);
  });

  it("maps closed ad to active project with high confidence", () => {
    const closed = job({ jobId: "closed-pos", name: "Solar Installer", status: "closed" });
    const published = job({ jobId: "pub-1", name: "Solar Installer" });
    const result = resolveClosedAdProjectMapping({
      row,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
    });
    assert.equal(result.status, "closed_ad_mapped_project");
    assert.equal(result.confidence, "high");
    assert.equal(result.passesPublishedJobGate, true);
    assert.equal(result.mappedPublishedJobId, "pub-1");
    assert.equal(isClosedAdMappingBlocker(result.status), false);
  });

  it("requires review for medium-confidence mapping", () => {
    const closed = job({ jobId: "closed-pos", name: "Solar Installer", status: "closed", city: "Phoenix", state: "AZ" });
    const published = job({ jobId: "pub-1", name: "Solar Installer", city: "Dallas", state: "TX" });
    const result = resolveClosedAdProjectMapping({
      row,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
    });
    assert.equal(result.status, "project_mapping_review");
    assert.equal(result.passesPublishedJobGate, false);
    assert.equal(isClosedAdMappingBlocker(result.status), true);
  });

  it("blocks when no active project matches", () => {
    const closed = job({ jobId: "closed-pos", name: "Unique Role", status: "closed" });
    const result = resolveClosedAdProjectMapping({
      row: { ...row, positionTitle: "Unique Role" },
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [job({ jobId: "pub-1", name: "Solar Installer" })],
    });
    assert.equal(result.status, "project_not_mappable");
    assert.equal(result.passesPublishedJobGate, false);
    assert.equal(isClosedAdMappingBlocker(result.status), true);
  });
});
