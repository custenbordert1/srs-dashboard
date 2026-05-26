import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDirectDepositBccAddress,
  getDirectDepositHrCopyConfig,
} from "@/lib/direct-deposit-email-config";

describe("direct-deposit-email-config", () => {
  it("reads DIRECT_DEPOSIT_BCC when set", () => {
    const prev = process.env.DIRECT_DEPOSIT_BCC;
    process.env.DIRECT_DEPOSIT_BCC = "humanresource@srsmerchandising.com";
    try {
      assert.equal(getDirectDepositBccAddress(), "humanresource@srsmerchandising.com");
      assert.equal(getDirectDepositHrCopyConfig().configured, true);
    } finally {
      if (prev === undefined) delete process.env.DIRECT_DEPOSIT_BCC;
      else process.env.DIRECT_DEPOSIT_BCC = prev;
    }
  });
});
