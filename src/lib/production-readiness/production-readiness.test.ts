import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  PERMISSION_MATRIX,
  roleHasPermission,
  buildDataQualitySnapshot,
} from "@/lib/production-readiness";
import {
  buildDeploymentChecklist,
  buildStartupDiagnostics,
} from "@/lib/production-readiness/deployment-readiness";
import {
  buildDemoModeSnapshot,
  isExecutiveDemoModeEnabled,
} from "@/lib/production-readiness/demo-mode";
import {
  getServerCached,
  setServerCached,
  getServerCacheMetrics,
  invalidateServerCache,
} from "@/lib/production-readiness/server-computation-cache";

describe("production-readiness permission matrix", () => {
  it("defines all four primary roles", () => {
    const roles = PERMISSION_MATRIX.map((row) => row.role);
    assert.deepEqual(roles.sort(), ["admin", "dm", "executive", "recruiter"]);
  });

  it("grants system_admin only to admin and executive", () => {
    assert.equal(roleHasPermission("admin", "system_admin"), true);
    assert.equal(roleHasPermission("executive", "system_admin"), true);
    assert.equal(roleHasPermission("recruiter", "system_admin"), false);
    assert.equal(roleHasPermission("dm", "system_admin"), false);
  });

  it("restricts user management to admin", () => {
    assert.equal(roleHasPermission("admin", "manage_users"), true);
    assert.equal(roleHasPermission("executive", "manage_users"), false);
    assert.equal(roleHasPermission("recruiter", "manage_users"), false);
  });
});

describe("production-readiness demo mode", () => {
  const original = process.env.EXECUTIVE_DEMO_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.EXECUTIVE_DEMO_MODE;
    else process.env.EXECUTIVE_DEMO_MODE = original;
  });

  it("detects demo mode from env", () => {
    process.env.EXECUTIVE_DEMO_MODE = "true";
    assert.equal(isExecutiveDemoModeEnabled(), true);
    const snapshot = buildDemoModeSnapshot();
    assert.equal(snapshot.enabled, true);
    assert.ok(snapshot.sections.length >= 5);
  });

  it("returns live mode when demo env is unset", () => {
    delete process.env.EXECUTIVE_DEMO_MODE;
    assert.equal(isExecutiveDemoModeEnabled(), false);
    assert.equal(buildDemoModeSnapshot().label, "Live data mode");
  });
});

describe("production-readiness deployment checklist", () => {
  it("returns checklist items with required ids", () => {
    const checklist = buildDeploymentChecklist();
    const ids = checklist.map((row) => row.id);
    assert.ok(ids.includes("env-required"));
    assert.ok(ids.includes("session-secret"));
    assert.ok(ids.includes("audit-logging"));
  });

  it("builds startup diagnostics shape", () => {
    const diagnostics = buildStartupDiagnostics();
    assert.equal(typeof diagnostics.envOk, "boolean");
    assert.equal(typeof diagnostics.authConfigured, "boolean");
    assert.equal(typeof diagnostics.demoMode, "boolean");
    assert.ok(diagnostics.nodeEnv.length > 0);
  });
});

describe("production-readiness data quality", () => {
  it("flags missing territory mappings and duplicate emails", () => {
    const issues = buildDataQualitySnapshot({
      fetchedAt: "2026-05-28T12:00:00.000Z",
      jobs: [{ jobId: "j1", name: "Job", state: "", status: "published" } as never],
      candidates: [
        { candidateId: "c1", email: "dup@example.com", state: "" } as never,
        { candidateId: "c2", email: "dup@example.com", state: "TX" } as never,
      ],
      workflows: null,
      opportunities: [{ openStatus: true, isStaffed: false } as never],
      syncFailures: ["breezy timeout"],
    });

    assert.ok(issues.some((row) => row.category === "territory-mapping"));
    assert.ok(issues.some((row) => row.category === "duplicate-candidate"));
    assert.ok(issues.some((row) => row.category === "stale-opportunity"));
    assert.ok(issues.some((row) => row.category === "sync-failure"));
  });
});

describe("production-readiness server cache", () => {
  beforeEach(() => invalidateServerCache());

  it("stores and retrieves cached values", () => {
    setServerCached("test-key", { value: 42 }, 60_000);
    assert.deepEqual(getServerCached<{ value: number }>("test-key"), { value: 42 });
  });

  it("tracks cache metrics after hits and misses", () => {
    getServerCached("missing");
    setServerCached("hit-key", 1, 60_000);
    getServerCached("hit-key");
    const metrics = getServerCacheMetrics();
    assert.ok(metrics.entries >= 1);
    assert.ok(metrics.hitRate >= 0);
  });
});
