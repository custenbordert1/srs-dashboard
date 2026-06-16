import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessRoute } from "@/lib/auth/permissions";
import { isMockDmLoginEnabled } from "@/lib/auth/mock-dm-logins";
import { apiRoutePolicy } from "@/lib/security/permissions";

describe("dm api access policy", () => {
  it("blocks DM from recruiting intelligence and decision support APIs", () => {
    for (const path of ["/api/recruiting/intelligence", "/api/recruiting/routing-intelligence", "/api/recruiting/live-snapshot"]) {
      const policy = apiRoutePolicy(path);
      assert.ok(policy.allowedRoles);
      assert.equal(policy.allowedRoles!.includes("dm"), false, path);
    }
  });

  it("blocks DM from recruiter escalation queue processing", () => {
    for (const path of ["/api/recruiting/escalations", "/api/recruiting/escalations/abc"]) {
      const policy = apiRoutePolicy(path);
      assert.ok(policy.allowedRoles);
      assert.equal(policy.allowedRoles!.includes("dm"), false, path);
      assert.ok(policy.allowedRoles!.includes("recruiter"), path);
    }
  });

  it("allows DM to list and create escalations", () => {
    const policy = apiRoutePolicy("/api/dm/escalations");
    assert.ok(policy.allowedRoles?.includes("dm"));
    assert.ok(policy.requiresTerritory);
    assert.equal(canAccessRoute("dm", "/api/dm/escalations"), true);
  });

  it("blocks DM from job management and DD tools", () => {
    for (const path of [
      "/api/job-management/drafts",
      "/api/breezy/jobs",
      "/api/onboarding/send-packet",
      "/api/onboarding/direct-deposit",
      "/api/onboarding/direct-deposit/backfill",
      "/api/onboarding/config",
    ]) {
      const policy = apiRoutePolicy(path);
      assert.ok(policy.allowedRoles);
      assert.equal(policy.allowedRoles!.includes("dm"), false, path);
    }
  });

  it("blocks DM from diagnostics and rep admin APIs", () => {
    for (const path of [
      "/api/breezy/candidates/debug",
      "/api/breezy/candidates/probe",
      "/api/breezy/candidates/health",
      "/api/rep-intelligence",
      "/api/reps/import",
      "/api/executive/dashboard",
    ]) {
      const policy = apiRoutePolicy(path);
      assert.ok(policy.allowedRoles);
      assert.equal(policy.allowedRoles!.includes("dm"), false, path);
    }
  });

  it("allows DM territory reads for dashboard", () => {
    for (const path of [
      "/api/dm/dashboard",
      "/api/dm-operating-system",
      "/api/candidates/workflows",
      "/api/breezy/candidates",
      "/api/coverage-risk",
      "/api/mel-projects",
    ]) {
      const policy = apiRoutePolicy(path);
      assert.ok(policy.allowedRoles?.includes("dm"), path);
    }
  });

  it("blocks DM from command center and breezy jobs route prefixes", () => {
    assert.equal(canAccessRoute("dm", "/api/job-management/breezy-jobs"), false);
    assert.equal(canAccessRoute("dm", "/api/breezy/jobs"), false);
    assert.equal(canAccessRoute("dm", "/"), false);
    assert.equal(canAccessRoute("dm", "/dm"), true);
    assert.equal(canAccessRoute("dm", "/api/dm-operating-system"), true);
    assert.equal(canAccessRoute("dm", "/api/breezy/candidates"), true);
  });

  it("allows recruiter workflow writes via route policy", () => {
    const policy = apiRoutePolicy("/api/candidates/workflows");
    assert.ok(policy.allowedRoles?.includes("recruiter"));
  });
});

describe("mock dm login gate", () => {
  it("is disabled outside development unless env flag set", () => {
    const original = process.env.ENABLE_MOCK_DM_LOGIN;
    const nodeEnv = process.env.NODE_ENV;
    try {
      process.env.ENABLE_MOCK_DM_LOGIN = "";
      (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
      assert.equal(isMockDmLoginEnabled(), false);
      process.env.ENABLE_MOCK_DM_LOGIN = "true";
      assert.equal(isMockDmLoginEnabled(), true);
    } finally {
      process.env.ENABLE_MOCK_DM_LOGIN = original;
      (process.env as { NODE_ENV?: string }).NODE_ENV = nodeEnv;
    }
  });
});
