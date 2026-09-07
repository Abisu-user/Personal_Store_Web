import assert from "node:assert/strict";
import test from "node:test";

import {
  OTP_EXPIRES_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  maskEmail,
  sanitizeOtp,
  secondsUntil,
} from "../../src/lib/auth/otp-policy.ts";

test("OTP policy uses the requested security limits", () => {
  assert.equal(OTP_EXPIRES_SECONDS, 600);
  assert.equal(OTP_RESEND_COOLDOWN_SECONDS, 60);
  assert.equal(OTP_MAX_ATTEMPTS, 5);
});

test("OTP input accepts only the first six digits", () => {
  assert.equal(sanitizeOtp("12a 34-567"), "123456");
  assert.equal(sanitizeOtp(""), "");
});

test("email masking does not expose the full local part", () => {
  assert.equal(maskEmail("abcdef@example.com"), "abc***@example.com");
  assert.equal(maskEmail("ab@example.com"), "ab@example.com");
});

test("expiry calculations never become negative", () => {
  const now = Date.parse("2026-09-07T00:00:00.000Z");
  assert.equal(secondsUntil("2026-09-07T00:00:10.000Z", now), 10);
  assert.equal(secondsUntil("2026-09-06T23:59:59.000Z", now), 0);
});
