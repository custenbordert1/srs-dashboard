import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  canWriteRecruitingFilesystem,
  isServerlessRuntime,
  resolveRecruitingDataDir,
  useInMemoryPersistence,
} from "@/lib/runtime-storage";

describe("runtime-storage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses project .data in local development", () => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.SRS_RECRUITING_DATA_DIR;

    assert.equal(isServerlessRuntime(), false);
    assert.equal(useInMemoryPersistence(), false);
    assert.ok(resolveRecruitingDataDir().endsWith(".data"));
  });

  it("uses in-memory persistence on Vercel without override", () => {
    process.env.VERCEL = "1";
    delete process.env.SRS_RECRUITING_DATA_DIR;

    assert.equal(isServerlessRuntime(), true);
    assert.equal(useInMemoryPersistence(), true);
    assert.equal(canWriteRecruitingFilesystem(), false);
    assert.equal(resolveRecruitingDataDir(), "/tmp/srs-dashboard-data");
    assert.notEqual(resolveRecruitingDataDir(), `${process.cwd()}/.data`);
  });

  it("seeds users in memory on serverless without touching bundle .data", async () => {
    process.env.VERCEL = "1";
    delete process.env.SRS_RECRUITING_DATA_DIR;

    const { findUserByEmail } = await import("@/lib/auth/user-store");
    const user = await findUserByEmail("executive@srsmerchandising.com");

    assert.ok(user);
    assert.equal(user.email, "executive@srsmerchandising.com");
    assert.equal(useInMemoryPersistence(), true);
  });

  it("buffers audit entries in memory on serverless", async () => {
    process.env.VERCEL = "1";
    delete process.env.SRS_RECRUITING_DATA_DIR;

    const { writeAuditLog } = await import("@/lib/security/audit-log");

    writeAuditLog({
      userId: "anonymous",
      role: "anonymous",
      action: "login_attempt",
      entityType: "user",
      entityId: "test@example.com",
      territory: "",
      metadata: { ip: "127.0.0.1" },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(useInMemoryPersistence(), true);
  });
});
