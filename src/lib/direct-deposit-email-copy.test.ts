import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDirectDepositVerificationEmailBody,
  buildDirectDepositVerificationEmailHtml,
} from "@/lib/direct-deposit-email-copy";
import { DIRECT_DEPOSIT_EMAIL_SUBJECT } from "@/lib/direct-deposit-types";

describe("direct-deposit-email-copy", () => {
  it("uses approved HR wording and subject", () => {
    const body = buildDirectDepositVerificationEmailBody();
    assert.match(body, /Welcome aboard!/);
    assert.match(body, /Wage Consent Form/);
    assert.match(body, /Bank Statement – A statement from your bank/);
    assert.match(body, /Screenshot from Online Banking/);
    assert.match(body, /Human Resource/);
    assert.match(body, /humanresource@srsmerchandising.com/);
    assert.match(body, /888-572-5580/);
    assert.doesNotMatch(body, /\bbcc\b/i);
    assert.equal(DIRECT_DEPOSIT_EMAIL_SUBJECT, "Direct Deposit Verification Needed");
  });

  it("renders HTML without BCC references", () => {
    const html = buildDirectDepositVerificationEmailHtml();
    assert.match(html, /Strategic Retail Solutions/);
    assert.match(html, /mailto:humanresource@srsmerchandising.com/);
    assert.doesNotMatch(html, /\bbcc\b/i);
  });
});
