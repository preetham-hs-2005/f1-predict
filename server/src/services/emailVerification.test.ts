import test from "node:test";
import assert from "node:assert/strict";
import { codeHash, verificationCodeFailure, verificationLimit } from "./emailVerification.js";
import { emailVerificationEmail, emailVerifiedEmail } from "./emailTemplates.js";
import { User, type UserDocument } from "../models/User.js";

const account = (fields: Partial<UserDocument> = {}) => ({ email: "fan@example.com", name: "Fan", ...fields }) as UserDocument;

test("legacy accounts are unverified and codes are keyed per account", () => {
  process.env.JWT_SECRET = "verification-test-secret";
  assert.equal(User.formatResponse(account()).emailVerified, false);
  assert.equal(User.formatResponse(account({ emailVerifiedAt: new Date() })).emailVerified, true);
  assert.notEqual(codeHash("user-one", "123456"), codeHash("user-two", "123456"));
  assert.notEqual(codeHash("user-one", "123456"), codeHash("user-one", "123457"));
  assert.equal(codeHash("user-one", "123456").includes("123456"), false);
});

test("resend cooldown and hourly limit use account timestamps", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  assert.equal(verificationLimit(account(), now), null);
  assert.match(verificationLimit(account({ verificationLastSentAt: new Date(now.getTime() - 59_000) }), now)!, /60 seconds/);
  assert.equal(verificationLimit(account({ verificationLastSentAt: new Date(now.getTime() - 60_000) }), now), null);
  assert.match(verificationLimit(account({ verificationWindowStart: new Date(now.getTime() - 59 * 60_000), verificationSentCount: 5 }), now)!, /hour/);
  assert.equal(verificationLimit(account({ verificationWindowStart: new Date(now.getTime() - 60 * 60_000), verificationSentCount: 5 }), now), null);
  assert.match(verificationLimit(account({ emailVerifiedAt: now }), now)!, /already verified/);
});

test("expired, reused, and exhausted codes require a new code", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const active = { verificationCodeHash: "hash", verificationExpiresAt: new Date(now.getTime() + 1_000), verificationAttempts: 0 };
  assert.match(verificationCodeFailure(account(active), now), /Incorrect/);
  assert.match(verificationCodeFailure(account({ ...active, verificationAttempts: 5 }), now), /Too many/);
  assert.match(verificationCodeFailure(account({ ...active, verificationExpiresAt: now }), now), /expired/);
  assert.match(verificationCodeFailure(account({ emailVerifiedAt: now }), now), /already used/);
});

test("verification and confirmation emails use branded escaped HTML", () => {
  const otp = emailVerificationEmail("<Fan>", "123456", "https://f1predict.dev/dashboard");
  assert.match(otp.html, /#9cf33b/);
  assert.match(otp.html, /123456/);
  assert.match(otp.html, /&lt;Fan&gt;/);
  assert.doesNotMatch(otp.html, /<Fan>/);
  assert.match(emailVerifiedEmail("Fan", "https://f1predict.dev/dashboard").text, /cleared to predict/);
});
