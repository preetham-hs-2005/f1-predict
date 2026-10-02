import assert from "node:assert/strict";
import test from "node:test";
import { validRunnerToken } from "./reminderRunner.js";

const secret = "a-secure-random-token-longer-than-32-chars";

test("reminder runner requires its configured bearer token", () => {
  assert.equal(validRunnerToken(`Bearer ${secret}`, secret), true);
  assert.equal(validRunnerToken(`Bearer ${secret}x`, secret), false);
  assert.equal(validRunnerToken(secret, secret), false);
  assert.equal(validRunnerToken(undefined, secret), false);
  assert.equal(validRunnerToken(`Bearer ${secret}`, undefined), false);
  assert.equal(validRunnerToken("Bearer short", "short"), false);
});
