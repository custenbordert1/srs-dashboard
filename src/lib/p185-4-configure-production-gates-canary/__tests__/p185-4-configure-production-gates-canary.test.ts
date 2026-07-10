import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  evaluateProductionStorageGate,
  probeCronAuthentication,
} from "@/lib/p185-4-configure-production-gates-canary";
import {
  resetP185StorageMemoryForTests,
  setP185StorageTestFlags,
} from "@/lib/p185-production-paperwork-automation-runner";
import { installIsolatedRecruitingDataDir } from "@/lib/test/recruiting-test-isolation";

describe("P185.4 production gates", () => {
  let isolation: Awaited<ReturnType<typeof installIsolatedRecruitingDataDir>>;
  const prevCron = process.env.CRON_SECRET;
  const prevConfirm = process.env.P185_PRODUCTION_STORAGE_CONFIRMED;
  const prevVercel = process.env.VERCEL;
  const prevDurable = process.env.P185_DURABLE_DATA_DIR;

  beforeEach(async () => {
    isolation = await installIsolatedRecruitingDataDir("p185-4-");
    resetP185StorageMemoryForTests();
    setP185StorageTestFlags({ forceDurable: true });
    delete process.env.P185_PRODUCTION_STORAGE_CONFIRMED;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(async () => {
    await isolation.restore();
    resetP185StorageMemoryForTests();
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
    if (prevConfirm === undefined) delete process.env.P185_PRODUCTION_STORAGE_CONFIRMED;
    else process.env.P185_PRODUCTION_STORAGE_CONFIRMED = prevConfirm;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevDurable === undefined) delete process.env.P185_DURABLE_DATA_DIR;
    else process.env.P185_DURABLE_DATA_DIR = prevDurable;
  });

  it("blocks live when production storage is not confirmed", () => {
    const gate = evaluateProductionStorageGate();
    assert.equal(gate.approvedForLiveSend, false);
    assert.ok(gate.blockers.some((b) => /P185_PRODUCTION_STORAGE_CONFIRMED/i.test(b)));
  });

  it("allows local canary only after explicit storage confirmation", () => {
    process.env.P185_PRODUCTION_STORAGE_CONFIRMED = "1";
    const gate = evaluateProductionStorageGate();
    assert.equal(gate.approvedForLiveSend, true);
  });

  it("blocks Vercel local_filesystem without durable dir", () => {
    process.env.VERCEL = "1";
    process.env.P185_PRODUCTION_STORAGE_CONFIRMED = "1";
    delete process.env.P185_DURABLE_DATA_DIR;
    const gate = evaluateProductionStorageGate({
      storage: {
        adapter: "local_filesystem",
        durable: true,
        healthy: true,
        detail: "local",
        dataDir: "/var/task/.data",
      },
    });
    assert.equal(gate.approvedForLiveSend, false);
  });

  it("cron auth probe returns null when secret absent", () => {
    delete process.env.CRON_SECRET;
    delete process.env.P185_CRON_SECRET;
    assert.equal(probeCronAuthentication(), null);
  });

  it("cron auth probe passes with configured secret", () => {
    process.env.CRON_SECRET = "test-cron-secret-for-probe";
    assert.equal(probeCronAuthentication(), true);
  });
});
